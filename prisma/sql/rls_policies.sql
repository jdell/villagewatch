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

CREATE OR REPLACE FUNCTION public.vw_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.vw_current_role() = 'ADMIN'::public.user_role;
$$;

/**
 * GRANT SELECT to `authenticated` on every column of a table except the ones
 * named. Two columns need this — `incidents.raw_description` and
 * `villages.join_code` — and both are the column the surrounding table exists
 * to protect.
 *
 * Enumerated at run time rather than written out, because a hand-listed set of
 * columns is a list that goes stale: the migration that adds a column would
 * leave it ungranted and invisible, and the fix would look like a Prisma bug.
 * Re-running this file after a migration picks new columns up, which SETUP.md
 * already requires for the policies themselves.
 *
 * Note the trade-off this imposes on any future PostgREST caller: with
 * column-level SELECT, `select=*` fails outright rather than returning the
 * permitted columns. That is the safe direction — an error, not a silent
 * disclosure — but it means such a caller must name its columns, exactly as
 * `PUBLIC_INCIDENT_SELECT` already does on the Prisma side.
 */
CREATE OR REPLACE FUNCTION public.vw_grant_select_except(
  target_table text,
  excluded_columns text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  column_list text;
BEGIN
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
    INTO column_list
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name = target_table
     AND NOT (c.column_name = ANY (excluded_columns));

  IF column_list IS NULL THEN
    RAISE EXCEPTION 'no grantable columns found on public.%', target_table;
  END IF;

  -- Revoke first: a table-wide SELECT left over from an earlier run of this
  -- file, or from the Supabase default ACL, would make the column list moot.
  EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated', target_table);
  EXECUTE format(
    'GRANT SELECT (%s) ON public.%I TO authenticated', column_list, target_table
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vw_grant_select_except(text, text[]) FROM public, anon, authenticated;

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
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pattern_alerts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs               ENABLE ROW LEVEL SECURITY;
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
-- address. `join_code` is the one column that matters, and it is checked
-- server-side in `POST /api/auth/register`, never sent to a browser.
--
-- Never sent by *this* application, which is not the same as unreachable. A
-- village-wide SELECT grant includes `join_code`, and a join code is what grants
-- membership — any account could have read every village's code through
-- PostgREST. So SELECT is granted column by column instead, which is the one
-- mechanism that distinguishes columns; a policy cannot.

GRANT INSERT, UPDATE ON public.villages TO authenticated;
SELECT public.vw_grant_select_except('villages', ARRAY['join_code']);

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
       OR NEW.verified_by_id IS DISTINCT FROM OLD.verified_by_id THEN
      RAISE EXCEPTION
        'role, village and verification are set by the server, not by the account holder';
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
-- So the column grant that comment used to ask for is here. `authenticated`
-- gets SELECT on every column of `incidents` except `raw_description`, and a
-- resident reading their neighbour's verbatim words through PostgREST — names,
-- plates, addresses, the whole reason the anonymisation pass exists — stops
-- being a thing the database permits.
--
-- INSERT and UPDATE stay table-wide: a reporter has to be able to write their
-- own words in, and rewriting the raw text of their own queued report is not a
-- disclosure. It is reading somebody else's that matters.

GRANT INSERT, UPDATE ON public.incidents TO authenticated;
SELECT public.vw_grant_select_except('incidents', ARRAY['raw_description']);

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

/** A reporter always sees their own, including drafts and rejections. */
DROP POLICY IF EXISTS incidents_select_own ON public.incidents;
CREATE POLICY incidents_select_own
  ON public.incidents FOR SELECT
  TO authenticated
  USING (reporter_id = (SELECT auth.uid()));

/** The moderation queue — everything in the coordinator's own village. */
DROP POLICY IF EXISTS incidents_select_coordinator ON public.incidents;
CREATE POLICY incidents_select_coordinator
  ON public.incidents FOR SELECT
  TO authenticated
  USING (
    public.vw_is_coordinator()
    AND village_id = public.vw_current_village_id()
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

/** Moderation. Any status, any report, inside the coordinator's own village. */
DROP POLICY IF EXISTS incidents_update_coordinator ON public.incidents;
CREATE POLICY incidents_update_coordinator
  ON public.incidents FOR UPDATE
  TO authenticated
  USING (
    public.vw_is_coordinator()
    AND village_id = public.vw_current_village_id()
  )
  WITH CHECK (
    public.vw_is_coordinator()
    AND village_id = public.vw_current_village_id()
  );

-- No DELETE policy. Withdrawing a report is `deleteIncidentAction`, which
-- writes the audit row first (domain rule 7) — a direct DELETE would not.

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
