-- Row-level security for VillageWatch.
--
-- Run this once, AFTER `prisma migrate dev` has created the tables and after
-- `prisma/sql/postgis.sql`:
--
--   psql "$DIRECT_URL" -f prisma/sql/rls_policies.sql
--
-- Re-runnable: every policy is dropped before it is created, so applying this
-- after a later migration is safe.
--
-- Requires Supabase: `auth.uid()` and the `anon` / `authenticated` roles come
-- from Supabase's own schema, not from stock Postgres. On a bare local database
-- this script will fail on the first helper function, which is the correct
-- outcome — there is nothing here to protect without Supabase Auth in front.
--
-- ---------------------------------------------------------------------------
-- What these policies do and do not protect
-- ---------------------------------------------------------------------------
--
-- **They do not gate the application's own reads.** Next.js talks to Postgres
-- through Prisma as the table owner (`postgres`), and a table owner bypasses
-- RLS unless FORCE ROW LEVEL SECURITY is set. Enabling RLS therefore changes
-- nothing about how the app behaves today — `requireSession()`, the
-- `villageId` scoping on every query and `PUBLIC_INCIDENT_SELECT` remain the
-- primary enforcement, exactly as CLAUDE.md describes.
--
-- What they protect is everything that connects as `authenticated` or `anon`:
-- the Supabase JS client, PostgREST (`/rest/v1/...`), Realtime, and anything
-- reached with a leaked anon key. Those roles can reach every table in the
-- `public` schema by default, so without RLS the anon key is a full read of
-- `raw_description` for every village in the system. That is the hole this
-- closes, and it is the reason "RLS is not configured" has been the top item
-- under "Not built yet" since Day 1.
--
-- FORCE ROW LEVEL SECURITY is deliberately NOT set. It would apply these
-- policies to the Prisma connection too, and `auth.uid()` is NULL there — the
-- app would lose access to its own tables. If you ever move the runtime onto a
-- non-owner role with a per-request JWT, revisit that decision here.
--
-- ---------------------------------------------------------------------------
-- Two deliberate departures from the Day 5 brief
-- ---------------------------------------------------------------------------
--
-- 1. **Incident SELECT covers PUBLISHED *and* RESOLVED**, not PUBLISHED alone.
--    `PUBLIC_INCIDENT_STATUSES` in `src/lib/constants.ts` is both, and a
--    resolved report is one residents are meant to keep seeing. Policies that
--    said PUBLISHED only would disagree with the app the day the runtime moves
--    onto a request-scoped role. Reporters can additionally always read their
--    own rows, whatever the status — the edit and withdraw screens need it.
--
-- 2. **Notification SELECT is own-rows-only, not village-wide.** A
--    `notifications` row records that one named resident was told about one
--    incident. Village-wide SELECT would let any resident enumerate which of
--    their neighbours was alerted to what, which is a worse leak than the one
--    the anonymised `description` column exists to prevent. If you genuinely
--    want the village-wide version, the policy to change is
--    `notifications_select_own` — it is the only line that needs it.

-- ---------------------------------------------------------------------------
-- Schema grants
-- ---------------------------------------------------------------------------
--
-- Everything below this line grants table privileges to `authenticated`, and a
-- table privilege is worthless without USAGE on the schema that holds it. On a
-- stock Supabase project the `public` schema is owned by `pg_database_owner`
-- and already grants USAGE to anon, authenticated and service_role, so the rest
-- of this file used to assume it.
--
-- It cannot. `prisma migrate` offers to reset on drift, and accepting runs
-- `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` — the schema comes back
-- owned by `postgres` with `{postgres=UC/postgres}` and nothing else. Nothing
-- in the application breaks, because Prisma connects as the owner and Auth and
-- Storage live in their own schemas; what breaks silently is every policy in
-- this file, because PostgREST never gets far enough to be filtered by one.
-- The symptom is `42501 permission denied for schema public` and the failure
-- mode is worse than an error: the policies look applied and enforce nothing.
--
-- `anon` is deliberately NOT granted USAGE. It is the role a signed-out browser
-- gets and no VillageWatch table has a row it should see, so it is kept out one
-- layer earlier than RLS rather than being filtered by it.

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
REVOKE USAGE ON SCHEMA public FROM anon;

-- New tables inherit `pg_default_acl`, which on Supabase grants anon and
-- authenticated *every* privilege on anything `postgres` creates — so the next
-- Prisma migration would add a table that anon can read, write and delete, with
-- RLS off, before anyone re-runs this file. Revoking the defaults makes a new
-- table arrive closed, and every grant below deliberate.
--
-- service_role keeps its defaults: it is the admin key, it holds BYPASSRLS, and
-- the server code that uses it does its own session and village checks.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
--
-- SECURITY DEFINER on purpose. A policy on `users` that reads `users` to find
-- the caller's role would re-enter its own policy and recurse until Postgres
-- gives up. A definer function runs as the owner, skips RLS, and breaks the
-- cycle. STABLE lets the planner call it once per statement rather than once
-- per row.
--
-- `search_path` is pinned empty and every reference below is schema-qualified:
-- a definer function that resolves names through the caller's search_path is a
-- privilege-escalation primitive.

CREATE OR REPLACE FUNCTION public.vw_current_village_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.village_id FROM public.users u WHERE u.id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.vw_current_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.role FROM public.users u WHERE u.id = (SELECT auth.uid());
$$;

/** Coordinator, moderator or admin — mirrors COORDINATOR_ROLES. */
CREATE OR REPLACE FUNCTION public.vw_is_coordinator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.vw_current_role()
         IN ('COORDINATOR'::public.user_role,
             'MODERATOR'::public.user_role,
             'ADMIN'::public.user_role);
$$;

/**
 * NOTE: this is no longer what the application means by "administrator".
 *
 * The app gates `/admin` on the signed-in email against the `ADMIN_EMAILS`
 * environment variable (`src/lib/admin.ts`), because nothing ever set
 * `users.role = 'ADMIN'` and the first administrator therefore had to be
 * created by hand in a SQL console. `UserRole.ADMIN` survives for these
 * policies and only for these policies.
 *
 * That divergence is harmless today and is worth saying out loud: these
 * policies gate the `authenticated` / PostgREST path, the app connects as the
 * table owner and bypasses them, so the two definitions never meet. They would
 * meet the moment the runtime moved onto a request-scoped role, and at that
 * point this function has to learn about the allow-list — probably as a table
 * the environment variable seeds, since a policy cannot read `process.env`.
 */
CREATE OR REPLACE FUNCTION public.vw_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.vw_current_role() = 'ADMIN'::public.user_role;
$$;

-- An earlier version of this file granted the column list by enumerating
-- `information_schema` and excluding the sensitive names. It is dropped rather
-- than left unused: a helper that grants a column to `authenticated` from a
-- deny-list is exactly the shape a later reader should not find lying around and
-- reach for, because it fails open — a column added by a migration is granted
-- automatically, which is the wrong direction for this table.
DROP FUNCTION IF EXISTS public.vw_grant_select_except(text, text[]);

REVOKE EXECUTE ON FUNCTION public.vw_current_village_id() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.vw_current_role() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.vw_is_coordinator() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.vw_is_admin() FROM public, anon;

GRANT EXECUTE ON FUNCTION public.vw_current_village_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vw_current_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vw_is_coordinator() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vw_is_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
--
-- Including the implicit many-to-many join table Prisma created for
-- `PatternAlert.incidents`. An unprotected join table is still a village-wide
-- read of which incidents clustered together.

ALTER TABLE public.villages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_media           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_votes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_alerts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordinator_requests     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.police_crimes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.police_data_syncs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.police_neighbourhoods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_PatternAlertIncidents" ENABLE ROW LEVEL SECURITY;

-- Nothing in this schema is public. `anon` is the role a signed-out browser
-- gets, and no VillageWatch table has a row it should see.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- And start `authenticated` from nothing too, so that every privilege it holds
-- is one of the explicit GRANTs below. Tables created before the default-ACL
-- revoke above already carry the Supabase default of *every* privilege to
-- `authenticated` — including DELETE on `incidents`, which no policy in this
-- file allows. RLS denies it anyway, but a table privilege nobody meant to
-- issue is one `FORCE ROW LEVEL SECURITY` or one careless policy away from
-- mattering.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;

-- ---------------------------------------------------------------------------
-- villages
-- ---------------------------------------------------------------------------
--
-- Readable by any signed-in user rather than by members only: the registration
-- screen lists active villages to someone who does not belong to one yet, and
-- `Village` carries no personal data — a name, a map centre and a contact
-- address.
--
-- The SELECT grant is per COLUMN, not table-wide. Two columns on this table are
-- credentials rather than data, and a row policy cannot withhold a column:
--
--   join_code            joins a resident to a village. Checked server-side in
--                        `POST /api/auth/register` and never sent to a browser
--                        by our code — but a table-wide grant means the anon key
--                        can read it straight out of PostgREST regardless of
--                        what our code does.
--   whatsapp_channel_id  the address a relay posts to. Anyone holding it can
--                        write to a village's public channel.
--
-- Four more are withheld for a different reason. `dpia_accepted_by_id`,
-- `apd_accepted_by_id`, `dpa_accepted_by_id` and `community_dpa_accepted_by_id`
-- are `users.id` values, and a user id read from another village is a
-- cross-village read of a person even though it is not a credential — so the
-- four *timestamps* are granted, which is what a resident could legitimately
-- want to know about their own village, and the four *identities* are not.
-- `/dashboard/compliance` renders the name through Prisma, which owns the table
-- and bypasses every policy in this file.
--
-- Everything else stays readable. Listing the safe columns rather than revoking
-- the unsafe ones is deliberate: a column added later is withheld by default and
-- someone has to think about it, which is the failure mode we want. It also
-- means a `SELECT *` from PostgREST errors rather than quietly returning less —
-- a loud failure over a silent one.
--
-- Nothing in the app is affected. Prisma connects as the table owner and
-- bypasses all of this, and no code path reads a table through the Supabase JS
-- client — only Storage.

-- Clears any table-wide SELECT left by an earlier version of this file. A
-- column grant does not narrow a table grant — they add — so without this the
-- second run of a database that once had the broad grant keeps it.
REVOKE SELECT ON public.villages FROM authenticated;

GRANT SELECT (
  id, name, slug, description, status,
  center_lat, center_lng, default_zoom, radius_meters, boundary,
  region, postcode, country, timezone, population,
  village_code,
  alert_threshold, contact_email, contact_phone, auto_approve,
  parish_council, privacy_level,
  mode,
  dpia_accepted_at, apd_accepted_at, dpa_accepted_at,
  community_dpa_accepted_at,
  whatsapp_channel_url, whatsapp_enabled, whatsapp_min_severity,
  created_at, updated_at
) ON public.villages TO authenticated;

GRANT INSERT, UPDATE ON public.villages TO authenticated;

DROP POLICY IF EXISTS villages_select_authenticated ON public.villages;
CREATE POLICY villages_select_authenticated
  ON public.villages FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS villages_insert_admin ON public.villages;
CREATE POLICY villages_insert_admin
  ON public.villages FOR INSERT
  TO authenticated
  WITH CHECK (public.vw_is_admin());

DROP POLICY IF EXISTS villages_update_admin ON public.villages;
CREATE POLICY villages_update_admin
  ON public.villages FOR UPDATE
  TO authenticated
  USING (public.vw_is_admin())
  WITH CHECK (public.vw_is_admin());

-- No DELETE policy. Deleting a village cascades every incident in it.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
--
-- A resident reads their own row and no one else's. Coordinators are NOT given
-- a village-wide read here even though the brief allows ADMIN one: `users`
-- holds `address_line`, `home_lat`/`home_lng` and `phone`, and the resident
-- verification screen that would need them does not exist yet. Widen this when
-- it does, and widen it to the columns it actually needs.
--
-- The UPDATE policy cannot stop a resident writing `role = 'ADMIN'` to their
-- own row — a policy filters rows, not columns. The trigger below does that
-- instead, and it is what makes domain rule 5 true at the database rather than
-- only in `saveSettingsAction`.

GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT INSERT ON public.users TO authenticated;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own
  ON public.users FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS users_select_admin ON public.users;
CREATE POLICY users_select_admin
  ON public.users FOR SELECT
  TO authenticated
  USING (public.vw_is_admin() AND village_id = public.vw_current_village_id());

DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- Registration creates the profile row through the server, but the id must
-- match the authenticated user either way.
DROP POLICY IF EXISTS users_insert_self ON public.users;
CREATE POLICY users_insert_self
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

-- No DELETE policy: `Incident.reporterId` is ON DELETE SET NULL, so removing a
-- user silently detaches their reports. Account deletion is a server job.

/**
 * Domain rule 5: `role`, `village_id` and `verified_at` are set by server code
 * from a verified join code or a coordinator action, never by the account
 * holder. Enforced for `authenticated` only — the Prisma connection runs as the
 * owner and is the server code this is protecting them from.
 *
 * `deleted_at` is guarded with them, and it is the one on the list that a
 * resident does have a right to set — just not here. Closing an account is
 * `deleteAccountAction`, which erases the reports and the media first; setting
 * this column alone through PostgREST would produce an account that reads as
 * closed with every report still on the map, which is the opposite of what the
 * resident asked for. The direction that actually matters is the other one:
 * without this clause a closed account could sign in to Supabase Auth directly
 * with the anon key, `UPDATE users SET deleted_at = NULL`, and let itself back
 * in past both sign-in gates.
 *
 * SECURITY INVOKER, deliberately. Inside a SECURITY DEFINER function
 * `current_user` is the function's owner, so the check below would compare the
 * owner's name and never fire. As an invoker function it sees the role
 * PostgREST switched to, which is the thing being tested.
 */
CREATE OR REPLACE FUNCTION public.vw_guard_user_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.village_id IS DISTINCT FROM OLD.village_id
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.verified_by_id IS DISTINCT FROM OLD.verified_by_id
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION
        'role, village, verification and account closure are set by the server, not by the account holder';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_privilege_columns ON public.users;
CREATE TRIGGER users_guard_privilege_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.vw_guard_user_privilege_columns();

-- ---------------------------------------------------------------------------
-- incidents
-- ---------------------------------------------------------------------------
--
-- Note what these policies cannot do: `raw_description` is a column on this
-- table, so any policy that grants SELECT on a row grants SELECT on the
-- reporter's verbatim words. RLS narrows *which rows* leak, not which columns,
-- and domain rule 1 is otherwise kept only in application code —
-- `PUBLIC_INCIDENT_SELECT` omitting the column and `readRawDescription()`
-- auditing every read.
--
-- So the column grant that comment used to ask for is here, in the same shape
-- as the one on `villages`: the safe columns are listed, `raw_description` is
-- simply not among them. A resident reading their neighbour's verbatim words
-- through PostgREST — names, plates, addresses, the whole reason the
-- anonymisation pass exists — stops being a thing the database permits.
--
-- Listed rather than excluded, for the reason given on `villages`: a column
-- added by a later migration is withheld until somebody adds it here, which is
-- the direction we want to fail in. The cost is that this list has to be
-- maintained, and SETUP.md already says to re-run this file after a migration.
--
-- INSERT and UPDATE stay table-wide: a reporter has to be able to write their
-- own words in, and rewriting the raw text of their own queued report is not a
-- disclosure. It is reading somebody else's that matters.

GRANT INSERT, UPDATE ON public.incidents TO authenticated;

-- Clears any table-wide SELECT left by an earlier version of this file — a
-- column grant adds to a table grant rather than narrowing it.
REVOKE SELECT ON public.incidents FROM authenticated;

GRANT SELECT (
  id, reference, reference_year, village_incident_number,
  village_id, reporter_id,
  type, severity, status, source,
  title, description,
  ai_summary, ai_model, ai_processed_at, ai_confidence, anonymized,
  people_count, recurring, pattern_note, is_anonymous,
  occurred_at, reported_at, resolved_at,
  location_text, lat, lng, location_point, location_fuzz_meters,
  reported_to_police, police_reference,
  view_count, confirm_count,
  moderated_by_id, moderated_at, moderation_note,
  created_at, updated_at
) ON public.incidents TO authenticated;

/** Published and resolved reports, anywhere in the reader's own village. */
DROP POLICY IF EXISTS incidents_select_public ON public.incidents;
CREATE POLICY incidents_select_public
  ON public.incidents FOR SELECT
  TO authenticated
  USING (
    village_id = public.vw_current_village_id()
    AND status IN ('PUBLISHED'::public.incident_status,
                   'RESOLVED'::public.incident_status)
  );

-- `REMOVED` is excluded from both policies below and from nothing above it,
-- because `incidents_select_public` is already narrowed to the two statuses a
-- resident may see. These two are the wide ones — "my own, whatever the status"
-- and "everything in my village" — and both would otherwise return a report its
-- reporter has erased (UK GDPR Article 17, `src/lib/erasure.ts`).
--
-- The row survives an erasure so the audit trail's `entity_id` still resolves
-- and the reference is never reissued. Its contents do not: `removeIncident()`
-- overwrites the text, the landmark and the coordinates with a tombstone in the
-- same write that sets the status, so a leak here would disclose a placeholder
-- rather than a resident's words.
--
-- These clauses are still worth having, for the same reason the app filters the
-- status rather than trusting the tombstone. What a `REMOVED` row still carries
-- is `reference`, `type`, `severity` and `occurred_at` — enough to tell a
-- coordinator that a report was filed on a date and then withdrawn, which is
-- exactly the inference a resident exercising Article 17 is entitled not to
-- hand over. Defence in depth on a row that has already been emptied.

/** A reporter sees their own, including drafts and rejections — but not erased. */
DROP POLICY IF EXISTS incidents_select_own ON public.incidents;
CREATE POLICY incidents_select_own
  ON public.incidents FOR SELECT
  TO authenticated
  USING (
    reporter_id = (SELECT auth.uid())
    AND status <> 'REMOVED'::public.incident_status
  );

/** The moderation queue — everything in the coordinator's own village. */
DROP POLICY IF EXISTS incidents_select_coordinator ON public.incidents;
CREATE POLICY incidents_select_coordinator
  ON public.incidents FOR SELECT
  TO authenticated
  USING (
    public.vw_is_coordinator()
    AND village_id = public.vw_current_village_id()
    AND status <> 'REMOVED'::public.incident_status
  );

/**
 * File into your own village, as yourself. `status` is pinned to the queue: a
 * client that could insert `PUBLISHED` would have published to every phone in
 * the village without a coordinator seeing it (domain rules 1 and 6).
 */
DROP POLICY IF EXISTS incidents_insert_own ON public.incidents;
CREATE POLICY incidents_insert_own
  ON public.incidents FOR INSERT
  TO authenticated
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND village_id = public.vw_current_village_id()
    AND status IN ('DRAFT'::public.incident_status,
                   'PENDING_REVIEW'::public.incident_status)
  );

/**
 * The reporter's own edit, and only while the report is still in the queue.
 * Both clauses matter: USING picks the rows that may be edited, WITH CHECK
 * stops the edit itself moving the row to PUBLISHED or into another village.
 */
DROP POLICY IF EXISTS incidents_update_own ON public.incidents;
CREATE POLICY incidents_update_own
  ON public.incidents FOR UPDATE
  TO authenticated
  USING (
    reporter_id = (SELECT auth.uid())
    AND status IN ('DRAFT'::public.incident_status,
                   'PENDING_REVIEW'::public.incident_status)
  )
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND village_id = public.vw_current_village_id()
    AND status IN ('DRAFT'::public.incident_status,
                   'PENDING_REVIEW'::public.incident_status)
  );

/**
 * Moderation. Any status, any report, inside the coordinator's own village —
 * except that neither end may be `REMOVED`.
 *
 * USING excludes it because an erased report is not in the queue and moderating
 * one would attach a decision to something nobody can read. WITH CHECK excludes
 * it for a different and larger reason: `REMOVED` is not a moderation outcome at
 * all. It is written by `removeIncident()`, which deletes the photographs from
 * the bucket and the tags from the database *before* it sets the status, and the
 * status is the only part of that a client could reproduce. A coordinator who
 * could write it here would produce a report that looks erased on every screen
 * while its media sits in storage — erasure as an appearance rather than an act,
 * which is the exact failure this whole feature exists to avoid.
 */
DROP POLICY IF EXISTS incidents_update_coordinator ON public.incidents;
CREATE POLICY incidents_update_coordinator
  ON public.incidents FOR UPDATE
  TO authenticated
  USING (
    public.vw_is_coordinator()
    AND village_id = public.vw_current_village_id()
    AND status <> 'REMOVED'::public.incident_status
  )
  WITH CHECK (
    public.vw_is_coordinator()
    AND village_id = public.vw_current_village_id()
    AND status <> 'REMOVED'::public.incident_status
  );

-- No DELETE policy, and erasure deliberately does not need one. A resident
-- deleting their own report goes through `removeIncident()` in
-- `src/lib/erasure.ts`, which writes the audit row first (domain rule 7),
-- removes the objects from storage before the rows that point at them, and
-- leaves the incident as `REMOVED` rather than dropping it — a direct DELETE
-- would do none of those, and would leave the trail naming an id that resolves
-- to nothing. `incidents_update_own` above cannot reach `REMOVED` either: its
-- WITH CHECK pins the status to the two queue values.

-- ---------------------------------------------------------------------------
-- incident_media
-- ---------------------------------------------------------------------------
--
-- `redacted_at IS NOT NULL` is in the read policy for the same reason
-- `src/app/(app)/incidents/page.tsx` filters on it: an attachment is only safe
-- to serve once it has been through the blur pipeline (domain rule 3). A row
-- without it is either mid-upload or a bug, and neither should reach a
-- neighbour.

GRANT SELECT, INSERT, DELETE ON public.incident_media TO authenticated;

DROP POLICY IF EXISTS incident_media_select_public ON public.incident_media;
CREATE POLICY incident_media_select_public
  ON public.incident_media FOR SELECT
  TO authenticated
  USING (
    redacted_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.village_id = public.vw_current_village_id()
         AND i.status IN ('PUBLISHED'::public.incident_status,
                          'RESOLVED'::public.incident_status)
    )
  );

/** The reporter sees their own attachments while the report is in the queue. */
DROP POLICY IF EXISTS incident_media_select_own ON public.incident_media;
CREATE POLICY incident_media_select_own
  ON public.incident_media FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND (i.reporter_id = (SELECT auth.uid())
              OR (public.vw_is_coordinator()
                  AND i.village_id = public.vw_current_village_id()))
    )
  );

DROP POLICY IF EXISTS incident_media_insert_own ON public.incident_media;
CREATE POLICY incident_media_insert_own
  ON public.incident_media FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.reporter_id = (SELECT auth.uid())
    )
  );

/** Removing an attachment from your own report, before it is published. */
DROP POLICY IF EXISTS incident_media_delete_own ON public.incident_media;
CREATE POLICY incident_media_delete_own
  ON public.incident_media FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.reporter_id = (SELECT auth.uid())
         AND i.status IN ('DRAFT'::public.incident_status,
                          'PENDING_REVIEW'::public.incident_status)
    )
  );

-- ---------------------------------------------------------------------------
-- incident_tags
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, DELETE ON public.incident_tags TO authenticated;

DROP POLICY IF EXISTS incident_tags_select_public ON public.incident_tags;
CREATE POLICY incident_tags_select_public
  ON public.incident_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.village_id = public.vw_current_village_id()
         AND i.status IN ('PUBLISHED'::public.incident_status,
                          'RESOLVED'::public.incident_status)
    )
  );

DROP POLICY IF EXISTS incident_tags_select_own ON public.incident_tags;
CREATE POLICY incident_tags_select_own
  ON public.incident_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND (i.reporter_id = (SELECT auth.uid())
              OR (public.vw_is_coordinator()
                  AND i.village_id = public.vw_current_village_id()))
    )
  );

DROP POLICY IF EXISTS incident_tags_insert_own ON public.incident_tags;
CREATE POLICY incident_tags_insert_own
  ON public.incident_tags FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.reporter_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS incident_tags_delete_own ON public.incident_tags;
CREATE POLICY incident_tags_delete_own
  ON public.incident_tags FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.reporter_id = (SELECT auth.uid())
         AND i.status IN ('DRAFT'::public.incident_status,
                          'PENDING_REVIEW'::public.incident_status)
    )
  );

-- ---------------------------------------------------------------------------
-- incident_votes
-- ---------------------------------------------------------------------------
--
-- A vote is a named opinion about a named report, which in a village is a more
-- personal thing than the two little buttons suggest: "who thought my report
-- was overblown" is a question with social consequences on a street where
-- everybody knows everybody. So the grants here are the narrowest in this file
-- after `rate_limit`.
--
-- **A resident reads their own rows and nobody else's.** That is what
-- `incident_votes_select_own` says, and it is deliberately not a village-wide
-- SELECT. The counts a resident sees on a card are computed by the application,
-- which connects as the table owner and bypasses every policy here — so
-- withholding the rows costs the product nothing and closes the one read that
-- would turn a count back into a list of names.
--
-- **A coordinator reads their own village's rows**, in the same sense they can
-- already read `raw_description`: they are the village's moderator and the
-- accountable person in it. Nothing in the application *shows* them a voter —
-- the dashboard's concern list and the report's "most concerning" section are
-- both aggregates — but the access is theirs, and pretending otherwise in a
-- policy while the same person can read the reporter's verbatim words would be
-- a distinction without a difference.
--
-- **Writes are own-rows-only and only on a report the resident can see.** The
-- INSERT and UPDATE checks repeat the application's own gate — the caller's
-- village, and `PUBLISHED` or `RESOLVED` (domain rules 4 and 6) — because a
-- client that could vote on a queued report would be pushing something up a
-- coordinator's ordering before the coordinator had decided it should exist.
--
-- DELETE is granted because "no opinion" is the absence of a row: pressing the
-- button you already pressed removes it. Deliberately *not* narrowed by the
-- incident's status, unlike INSERT — a report can be archived or rejected after
-- somebody voted on it, and a resident who could no longer withdraw their own
-- vote would be the one person unable to undo a thing they did.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.incident_votes TO authenticated;

DROP POLICY IF EXISTS incident_votes_select_own ON public.incident_votes;
CREATE POLICY incident_votes_select_own
  ON public.incident_votes FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS incident_votes_select_coordinator ON public.incident_votes;
CREATE POLICY incident_votes_select_coordinator
  ON public.incident_votes FOR SELECT
  TO authenticated
  USING (
    public.vw_is_coordinator()
    AND EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.village_id = public.vw_current_village_id()
    )
  );

DROP POLICY IF EXISTS incident_votes_insert_own ON public.incident_votes;
CREATE POLICY incident_votes_insert_own
  ON public.incident_votes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.village_id = public.vw_current_village_id()
         AND i.status IN ('PUBLISHED'::public.incident_status,
                          'RESOLVED'::public.incident_status)
    )
  );

DROP POLICY IF EXISTS incident_votes_update_own ON public.incident_votes;
CREATE POLICY incident_votes_update_own
  ON public.incident_votes FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  -- The WITH CHECK keeps the row on the same user and the same report: without
  -- it, an UPDATE is a way to move somebody else's vote onto your own id, or
  -- your own vote onto a report you were never allowed to vote on.
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.incidents i
       WHERE i.id = incident_id
         AND i.village_id = public.vw_current_village_id()
         AND i.status IN ('PUBLISHED'::public.incident_status,
                          'RESOLVED'::public.incident_status)
    )
  );

DROP POLICY IF EXISTS incident_votes_delete_own ON public.incident_votes;
CREATE POLICY incident_votes_delete_own
  ON public.incident_votes FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
--
-- Own rows only — see departure 2 at the top of this file. `read_at` is the
-- single column a client legitimately writes, and it is the only reason there
-- is an UPDATE policy at all; the WITH CHECK keeps the row on the same user.
--
-- INSERT is server-only. `src/lib/notifications.ts` is the one place that
-- sends anything, and it runs as the owner. There is no INSERT policy here on
-- purpose: a client that could write `notifications` rows could make the app
-- claim a neighbour had been alerted when nobody had.

GRANT SELECT, UPDATE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- pattern_alerts
-- ---------------------------------------------------------------------------
--
-- Village-scoped read. Created by the weekly digest only, which runs as the
-- owner — no INSERT policy, for the same reason as notifications.
--
-- Acknowledge and dismiss have no UI yet ("Not built yet" in CLAUDE.md). When
-- they arrive they will be coordinator actions, so the UPDATE policy is here
-- ready rather than added in a rush alongside the screen.

GRANT SELECT, UPDATE ON public.pattern_alerts TO authenticated;

DROP POLICY IF EXISTS pattern_alerts_select_village ON public.pattern_alerts;
CREATE POLICY pattern_alerts_select_village
  ON public.pattern_alerts FOR SELECT
  TO authenticated
  USING (village_id = public.vw_current_village_id());

DROP POLICY IF EXISTS pattern_alerts_update_coordinator ON public.pattern_alerts;
CREATE POLICY pattern_alerts_update_coordinator
  ON public.pattern_alerts FOR UPDATE
  TO authenticated
  USING (
    public.vw_is_coordinator()
    AND village_id = public.vw_current_village_id()
  )
  WITH CHECK (
    public.vw_is_coordinator()
    AND village_id = public.vw_current_village_id()
  );

-- ---------------------------------------------------------------------------
-- coordinator_requests
-- ---------------------------------------------------------------------------
--
-- An applicant reads their own applications. An administrator reads every one.
--
-- **The admin predicate here is deliberately not village-scoped**, unlike
-- `users_select_admin` and `audit_logs_select_admin` above. It is the one place
-- in this file where that is right, and the reason is the village directory:
-- `prisma/seed-villages.ts` seeds 10,670 parishes that contain nobody at all.
-- A village-scoped reviewer would mean an application could only ever be
-- approved by somebody who already holds the access being applied for — fine
-- for the first village, impossible for the second. This flow is what turns a
-- PENDING directory entry into a village with a coordinator, so its reviewer is
-- platform-wide. `src/lib/coordinator-requests.ts` makes the same call in the
-- application, for the same reason.
--
-- Note the consequence, because it is easy to read as a bug later: an admin can
-- SELECT a cross-village application here but NOT the applicant's `users` row,
-- which `users_select_admin` still scopes to their own village. Through
-- PostgREST that means an application whose applicant is a name they cannot
-- join to. The admin queue is unaffected — it reads through Prisma as the table
-- owner. Widen `users_select_admin` if and when something needs the join, and
-- widen it to the columns it actually needs.
--
-- SELECT is granted table-wide rather than per column, unlike `villages` and
-- `incidents`. Those two hold columns no row policy can withhold — a join code,
-- a channel id, a reporter's verbatim words. This table has no such column:
-- `reason` is the applicant's own account of themselves, written to be read by
-- the reviewer, and there is nobody the row policies admit who should be
-- reading a subset of it. Add a column for which that stops being true and it
-- needs the same per-column treatment `villages` got.

GRANT SELECT, INSERT, UPDATE ON public.coordinator_requests TO authenticated;

DROP POLICY IF EXISTS coordinator_requests_select_own ON public.coordinator_requests;
CREATE POLICY coordinator_requests_select_own
  ON public.coordinator_requests FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS coordinator_requests_select_admin ON public.coordinator_requests;
CREATE POLICY coordinator_requests_select_admin
  ON public.coordinator_requests FOR SELECT
  TO authenticated
  USING (public.vw_is_admin());

/**
 * Apply as yourself, to your own village, and only into the queue.
 *
 * The three pinned columns are the point. Without them a client could insert a
 * row that already says APPROVED, reviewed by whoever they liked — which grants
 * no access at all, because the role lives on `users` and
 * `users_guard_privilege_columns` refuses that write, but which would put a
 * forged approval in front of the next administrator to open the history tab.
 * A fabricated record of a decision is worse than no record, for the same
 * reason `audit_logs_insert_self` exists.
 */
DROP POLICY IF EXISTS coordinator_requests_insert_own ON public.coordinator_requests;
CREATE POLICY coordinator_requests_insert_own
  ON public.coordinator_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND village_id = public.vw_current_village_id()
    AND status = 'PENDING'::public.coordinator_request_status
    AND reviewed_by_id IS NULL
    AND reviewed_at IS NULL
    AND review_note IS NULL
  );

/** Deciding is an administrator's job and nobody else's. */
DROP POLICY IF EXISTS coordinator_requests_update_admin ON public.coordinator_requests;
CREATE POLICY coordinator_requests_update_admin
  ON public.coordinator_requests FOR UPDATE
  TO authenticated
  USING (public.vw_is_admin())
  WITH CHECK (public.vw_is_admin());

-- No DELETE policy, and no applicant UPDATE either. An application is a record
-- of something somebody asked for and what was decided about it; withdrawing it
-- by editing the row would leave the administrator's decision attached to text
-- they never read. The absence of a WITHDRAWN status in the enum is the same
-- decision seen from the other side.

-- ---------------------------------------------------------------------------
-- rate_limit
-- ---------------------------------------------------------------------------
--
-- **Server-only, and the only table in this file with no policies at all.**
--
-- That is the point rather than an omission. RLS is enabled and `authenticated`
-- holds no grant, so every read and write from PostgREST is refused before a
-- policy would be consulted. `src/lib/rate-limit.ts` is the sole caller and it
-- runs through Prisma as the table owner, which bypasses all of this.
--
-- A policy here would have to be "your own rows", and own-rows is exactly wrong
-- for a counter:
--
--   SELECT  tells a caller how much quota is left before they spend it, which
--           turns a limit into a schedule.
--   UPDATE  lets them set `count` back to zero, which is not a limit at all.
--   DELETE  is the same thing with an extra step.
--   INSERT  lets them pre-create a window at `count = 0` and, worse, write rows
--           under somebody else's `user_id` — the column is TEXT with no foreign
--           key, so nothing at the database would object.
--
-- There is no read a client legitimately makes: what a resident needs to know
-- about their quota is in the `X-RateLimit-*` headers the route already sends.
--
-- The explicit REVOKE is belt and braces. `REVOKE ALL ON ALL TABLES` above
-- already covers it, and the default-privileges revoke means a table created
-- after this file first ran arrives closed — but this table is the one where a
-- grant issued by accident is silently a hole rather than a visible bug, so it
-- says so in its own right.

REVOKE ALL ON public.rate_limit FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- _PatternAlertIncidents (implicit m2m join table)
-- ---------------------------------------------------------------------------
--
-- Column "A" is the incident id, "B" the pattern alert id — Prisma orders them
-- alphabetically by model name. Readable exactly when both ends are.

GRANT SELECT ON public."_PatternAlertIncidents" TO authenticated;

DROP POLICY IF EXISTS pattern_alert_incidents_select ON public."_PatternAlertIncidents";
CREATE POLICY pattern_alert_incidents_select
  ON public."_PatternAlertIncidents" FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pattern_alerts p
       WHERE p.id = "B"
         AND p.village_id = public.vw_current_village_id()
    )
  );

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
--
-- Append-only, and readable by admins only (domain rule 7).
--
-- The coordinator audit viewer at `/dashboard/audit` reads through Prisma as
-- the owner and enforces `requireCoordinator()` plus village scoping in the
-- page itself. If you move that page onto the request-scoped client, widen the
-- SELECT policy with the commented-out variant below rather than dropping the
-- admin one.

GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;

DROP POLICY IF EXISTS audit_logs_select_admin ON public.audit_logs;
CREATE POLICY audit_logs_select_admin
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.vw_is_admin() AND village_id = public.vw_current_village_id());

-- DROP POLICY IF EXISTS audit_logs_select_coordinator ON public.audit_logs;
-- CREATE POLICY audit_logs_select_coordinator
--   ON public.audit_logs FOR SELECT
--   TO authenticated
--   USING (public.vw_is_coordinator()
--          AND village_id = public.vw_current_village_id());

/**
 * The actor must be the caller. Without this a client could forge a trail
 * naming somebody else — which is worse than no trail, because it reads as
 * evidence.
 */
DROP POLICY IF EXISTS audit_logs_insert_self ON public.audit_logs;
CREATE POLICY audit_logs_insert_self
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = (SELECT auth.uid()));

-- No UPDATE policy and no DELETE policy. Their absence is the rule.

/**
 * Append-only at the database, not just in application code.
 *
 * The RLS policies above already stop `authenticated` rewriting history, but
 * Prisma connects as the owner and bypasses them — so "never update or delete
 * from application code" would be a convention one careless `deleteMany` could
 * break. This trigger makes it a constraint.
 *
 * Deleting an account no longer needs that hatch — see the actor_id carve-out
 * below. Removing trail *rows*, which is what `RETENTION.auditLogMonths` would
 * mean, still does, and remains a deliberate one-off act:
 *
 *   ALTER TABLE public.audit_logs DISABLE TRIGGER audit_logs_append_only;
 *   -- ... the purge ...
 *   ALTER TABLE public.audit_logs ENABLE TRIGGER audit_logs_append_only;
 *
 * Note that DISABLE TRIGGER takes an ACCESS EXCLUSIVE lock and is not
 * transactional in the way it looks: if the purge fails halfway, the trigger is
 * still off until the ENABLE runs. Wrap both in the same transaction.
 */
CREATE OR REPLACE FUNCTION public.vw_audit_logs_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- One UPDATE is permitted, and only one: severing `actor_id` when the account
  -- it points at is deleted.
  --
  -- `AuditLog.actorId` is ON DELETE SET NULL and `actor_email` / `actor_role`
  -- are denormalised "so the trail survives account deletion" — the schema was
  -- always designed for the actor row to go while the trail stays. A blanket
  -- refusal broke that: the cascade is an UPDATE, so deleting any account that
  -- had ever acted became impossible, and with it every UK GDPR erasure request
  -- and the dormant-account closure the privacy notice promises. The failure
  -- surfaced as `audit_logs is append-only: UPDATE is not permitted` raised from
  -- a DELETE on `users`, which reads as a bug in the wrong table entirely.
  --
  -- The test is deliberately not "actor_id changed". Every other column must be
  -- byte-identical, compared wholesale rather than listed, so a column added by
  -- a later migration is covered without anyone remembering to add it here. The
  -- content of the trail stays immutable; only the pointer to a person may be
  -- cut, and only ever to NULL. `actor_email` still names who acted.
  --
  -- `village_id` is the other ON DELETE SET NULL foreign key on this table and
  -- is deliberately NOT carved out with it. The two look symmetrical and are
  -- not: `actor_email` and `actor_role` mean severing `actor_id` costs the trail
  -- nothing, whereas there is no denormalised village column, so nulling
  -- `village_id` destroys the only record of which village an entry belongs to
  -- — the mutation of trail content this trigger exists to refuse. So
  -- `DELETE FROM villages` still fails here, and should: erasure is a right of a
  -- person, not of a tenant, and closing a village down is a deliberate act that
  -- belongs with the retention purge above rather than happening as a side
  -- effect of a cascade.
  IF TG_OP = 'UPDATE'
     AND OLD.actor_id IS NOT NULL
     AND NEW.actor_id IS NULL
     AND pg_catalog.to_jsonb(NEW) - 'actor_id' = pg_catalog.to_jsonb(OLD) - 'actor_id'
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.vw_audit_logs_append_only();

-- ---------------------------------------------------------------------------
-- police_crimes, police_data_syncs, police_neighbourhoods
-- ---------------------------------------------------------------------------
--
-- Open data about a place, scoped to the village it was fetched for.
--
-- None of these three holds personal data. `data.police.uk` publishes recorded
-- crime under the Open Government Licence with every record snapped to an
-- anonymisation point, and `police_neighbourhoods` carries the team a force
-- prints on its own website — a name, a rank and a published contact address.
-- So the reasoning here is not the reasoning behind `incidents`: there is no
-- column to withhold and no per-column grant, and SELECT is granted table-wide.
--
-- What is still scoped is the **village**, and for correctness rather than
-- privacy. A row is the answer to a question asked about one village's map
-- centre over the one-mile radius the API applies; served to a resident of a
-- different parish it would be a figure about somewhere else, presented as a
-- figure about here. Domain rule 4 holds for the same reason it holds
-- everywhere, even where the data is public.
--
-- **No INSERT, UPDATE or DELETE to anybody.** These tables are written by
-- `GET|POST /api/cron/police-data` alone, which runs through Prisma as the table
-- owner and bypasses every policy in this file. A client that could write here
-- could put a fabricated crime figure into a document a coordinator sends to
-- the police — which is worse than a wrong number, because the document says on
-- its face that the figures came from the Home Office.
--
-- `police_data_syncs` is granted SELECT alongside the crimes rather than held
-- back, and that is deliberate: it is the row that says whether a month with no
-- crimes in it was published-and-empty or never-fetched, and a client that could
-- read the counts but not that distinction would be able to draw the one chart
-- this feature exists to prevent.

GRANT SELECT ON public.police_crimes TO authenticated;

DROP POLICY IF EXISTS police_crimes_select_village ON public.police_crimes;
CREATE POLICY police_crimes_select_village
  ON public.police_crimes FOR SELECT
  TO authenticated
  USING (village_id = public.vw_current_village_id());

GRANT SELECT ON public.police_data_syncs TO authenticated;

DROP POLICY IF EXISTS police_data_syncs_select_village ON public.police_data_syncs;
CREATE POLICY police_data_syncs_select_village
  ON public.police_data_syncs FOR SELECT
  TO authenticated
  USING (village_id = public.vw_current_village_id());

GRANT SELECT ON public.police_neighbourhoods TO authenticated;

DROP POLICY IF EXISTS police_neighbourhoods_select_village ON public.police_neighbourhoods;
CREATE POLICY police_neighbourhoods_select_village
  ON public.police_neighbourhoods FOR SELECT
  TO authenticated
  USING (village_id = public.vw_current_village_id());

-- ---------------------------------------------------------------------------
-- Verify
-- ---------------------------------------------------------------------------
--
-- Every table in `public` should come back with rowsecurity = true:
--
--   SELECT tablename, rowsecurity
--     FROM pg_tables
--    WHERE schemaname = 'public'
--    ORDER BY tablename;
--
-- And the policies that back it:
--
--   SELECT tablename, policyname, cmd
--     FROM pg_policies
--    WHERE schemaname = 'public'
--    ORDER BY tablename, policyname;
--
-- The real test is with the anon key, signed in as a resident of village A:
-- a `select * from incidents` through the Supabase JS client must return that
-- village's published rows and nothing from village B.
