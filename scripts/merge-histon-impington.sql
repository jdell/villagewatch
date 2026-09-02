-- ===========================================================================
-- Merge one village into another — Impington into Histon.
-- ===========================================================================
--
-- WHAT THIS DOES
--
-- Moves every row that belongs to the absorbed village into the surviving one
-- and then archives the absorbed village. Residents, reports, pattern alerts
-- and coordinator applications move; the official police figures are deleted
-- rather than moved; the audit trail is not touched at all. Afterwards the
-- absorbed village still exists as an `ARCHIVED` row with no join code, no
-- residents and no reports — see ROLLBACK below for why it cannot be deleted.
--
-- The one operation with a cost is the incident references. `incidents` carries
-- a unique key on (village_id, reference_year, village_incident_number), so two
-- villages both numbering their 2026 reports from 1 cannot occupy the same
-- village without renumbering. Every absorbed report is therefore renumbered
-- onto the end of the survivor's sequence for its year and its stored
-- `reference` string is rebuilt — `VW-IMP-2026-0007` becomes `VW-HIS-2026-0041`.
-- Step 6 prints the old-to-new mapping and stores it on the merge's own audit
-- row, because those strings have been printed on police summaries, pasted into
-- WhatsApp and read out on the telephone.
--
-- Leaving the strings alone was the alternative and is worse: the merged
-- village's log would carry two villages' codes in one column while the columns
-- underneath said something else again. That is the failure
-- `20260803120000_incident_village_numbering` was written to prevent, and the
-- rebuild here is that migration's SQL — the `[^A-Za-z]` class and the `VIL`
-- fallback are `villageReferenceCode()` in `src/lib/incident-reference.ts`
-- written out. Keep all three in step.
--
--
-- WHEN TO RUN IT
--
-- Once, by hand, against `DIRECT_URL` (the session pooler on port 5432), by
-- somebody who has read the pre-flight output. It is not a migration: nothing
-- in `prisma/migrations/` refers to it, `database.yml` does not run it, and it
-- must never be pointed at a preview deployment's database.
--
-- Not while a coordinator is working. Reports move village mid-flight, the
-- queue's contents change underneath whoever is reviewing it, and one of the
-- two villages stops accepting reports the moment the archive lands. Tell both
-- coordinators first — this is a change to what residents can see and do, not
-- a tidy-up.
--
--
-- PREREQUISITES — check each one against the pre-flight output in Section 1
--
--   1. Direction. Section 0 says Impington is absorbed into Histon. That is the
--      only thing in this file that is a guess rather than a consequence; the
--      two are one civil parish in the ONS directory and Histon is the larger
--      half. Change the two slugs if the analysis said otherwise, and change
--      nothing else — every step reads them.
--
--   2. Roles. A COORDINATOR of the absorbed village becomes a coordinator of
--      the merged one, with the reveal of every resident's email address and
--      the audited read of every reporter's verbatim words that carries. That
--      is a privilege grant and it happens silently unless somebody decides
--      otherwise. Pre-flight 1.3 lists it; step 3 has an optional demotion
--      block, commented out.
--
--   3. Verification. `verified_at` travels with the resident. A coordinator of
--      Impington vouched that somebody lives in Impington, which is not quite
--      the same statement as living in Histon. Left alone on purpose — clearing
--      it would un-verify people nobody asked about — but it is a decision.
--
--   4. Compliance. The survivor must have accepted the documents its mode calls
--      for or the merged village accepts no report from anybody, including the
--      residents who could file this morning. The guard in step 1 refuses to
--      run otherwise; the fix is `/dashboard/compliance`, not this file.
--
--   5. Both villages backed up. Supabase's point-in-time restore is the whole
--      database, so know when the last snapshot was before you start.
--
--
-- HOW TO ROLL BACK — and you cannot, fully
--
-- Rehearse first. Change the final `COMMIT;` to `ROLLBACK;`, run the whole
-- file, read the mapping and the verification output, then change it back. The
-- transaction is genuinely atomic, so a rehearsal costs nothing but the time.
--
-- After a commit, the merge's audit row is what makes any reversal possible at
-- all, and that is the reason it carries lists of ids rather than counts. Once
-- `users.village_id` has been rewritten there is nothing left in the database
-- that says who used to be in Impington; the same is true of every report that
-- moved without a reference change. Read that row before touching anything:
--
--   SELECT before FROM audit_logs WHERE action = 'village.merged';
--
-- What can then be undone:
--
--   * Residents, reports, pattern alerts and applications move back with one
--     UPDATE each, keyed on the id lists in `before`. Roles and verification
--     were never altered, so nothing has to be restored.
--   * Incident references and numbers go back from `referenceMapping`.
--   * The absorbed village goes back to ACTIVE, and its join code has to be
--     re-minted — this file nulls it and deliberately does not record it, since
--     a credential in an append-only table is a credential that cannot be
--     rotated out of it. Take a copy from pre-flight 1.1 if that matters.
--   * The police rows come back on their own: the weekly sync refetches them
--     for whichever village centre is live. Nothing was lost that
--     data.police.uk will not publish again.
--
-- What cannot be undone:
--
--   * The audit trail. `audit_logs` is append-only at the database — the
--     `audit_logs_append_only` trigger rejects every DELETE including from the
--     owner and every UPDATE bar severing `actor_id`. The merge's own row is
--     permanent, and so is every row this file leaves pointing at the absorbed
--     village. That is also why the absorbed village row survives as ARCHIVED:
--     `ON DELETE SET NULL` on `audit_logs.village_id` is an UPDATE, the trigger
--     refuses it, and so `DELETE FROM villages` fails. Correctly — nulling it
--     would destroy the only record of which village an entry belongs to.
--
--     The consequence to say out loud: coordinators of the merged village will
--     not see Impington's history at `/dashboard/audit`, because that viewer is
--     scoped by village_id. The history is not gone, it is attached to a
--     village nobody can open. Step 8 has a commented block that moves the
--     trail using the trigger's own documented disable hatch; it is off by
--     default because rewriting an audit row to say a decision was taken in a
--     village where it was not is a worse trade than an unreachable trail.
--
--   * The old incident references as sent. The mapping is printed and stored,
--     so a reference quoted in an email can still be resolved by hand, but
--     anything already with a PCSO now names a report whose number has moved.
--
-- Every write is guarded and the whole thing is one transaction: it either all
-- lands or none of it does. `ON_ERROR_STOP` is set so a failed guard does not
-- leave psql running the rest of the file against an aborted transaction.
--
-- ===========================================================================

\set ON_ERROR_STOP on
\timing on


-- ---------------------------------------------------------------------------
-- Section 0 — parameters
-- ---------------------------------------------------------------------------
--
-- Slugs rather than ids: a slug is checkable by eye and an id is not, and this
-- is a file somebody has to review before it runs. Every statement below reads
-- these and nothing hardcodes a village.

\set SURVIVOR_SLUG 'histon-cambridgeshire'
\set ABSORBED_SLUG 'impington-cambridgeshire'

-- Whoever is accountable for the merge. Must be a `users` row — it is the actor
-- on the audit entry, and an audit row with nobody against it is a record of
-- something that apparently happened by itself. The address on the JWT that
-- opens `/admin`, i.e. one of ADMIN_EMAILS.
\set ACTOR_EMAIL 'info@yakasista.com'

-- Optional. The merged village's display name. Set it to the survivor's own
-- name to rename nothing. Both 'Histon' and 'Histon & Impington' derive the
-- reference code HIS — first three letters, non-letters dropped — so this
-- rename costs nothing downstream. A different name might not.
--
-- The slug is deliberately NOT renamed and should not be: `/join/<slug>` is
-- printed on every invite sheet and QR code already handed out, and there is no
-- redirect behind it.
\set SURVIVOR_NAME 'Histon & Impington'


-- ===========================================================================
-- Section 1 — PRE-FLIGHT (read-only)
-- ===========================================================================
--
-- Nothing here writes. Run this section on its own first, read all nine
-- answers, and only then decide whether Section 2 is the right thing to do.

\echo ''
\echo '=== 1.1 The two villages ==================================='

SELECT
  v.slug,
  v.name,
  v.status,
  v.mode,
  v.village_code,
  v.join_code,
  v.parish_council,
  v.privacy_level,
  v.auto_approve,
  v.whatsapp_enabled,
  v.center_lat,
  v.center_lng,
  v.created_at
FROM villages v
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
ORDER BY (v.slug = :'SURVIVOR_SLUG') DESC;

\echo ''
\echo '=== 1.2 Compliance — the survivor must be complete or the ==='
\echo '===     merged village accepts no report from anybody     ==='

-- Mirrors `isComplete()` in src/lib/compliance.ts: community mode is the one
-- agreement; council mode is the three documents OR a community acceptance that
-- has not been superseded, which is what keeps a village open mid-upgrade.
SELECT
  v.slug,
  v.mode,
  v.community_dpa_accepted_at,
  v.dpia_accepted_at,
  v.apd_accepted_at,
  v.dpa_accepted_at,
  CASE
    WHEN v.mode = 'community' THEN v.community_dpa_accepted_at IS NOT NULL
    ELSE (v.dpia_accepted_at IS NOT NULL
          AND v.apd_accepted_at IS NOT NULL
          AND v.dpa_accepted_at IS NOT NULL)
         OR v.community_dpa_accepted_at IS NOT NULL
  END AS accepts_reports
FROM villages v
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
ORDER BY (v.slug = :'SURVIVOR_SLUG') DESC;

\echo ''
\echo '=== 1.3 Residents, by role — READ THIS ONE TWICE ==========='
\echo '===     a COORDINATOR of the absorbed village becomes a   ==='
\echo '===     coordinator of the merged one                     ==='

SELECT
  v.slug,
  u.role,
  count(*)                                          AS users,
  count(*) FILTER (WHERE u.verified_at IS NOT NULL) AS verified,
  count(*) FILTER (WHERE u.deleted_at IS NOT NULL)  AS closed,
  count(*) FILTER (WHERE u.home_lat IS NOT NULL)    AS with_home_location
FROM users u
JOIN villages v ON v.id = u.village_id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
GROUP BY v.slug, u.role
ORDER BY v.slug, u.role;

\echo ''
\echo '--- and the privileged accounts by name --------------------'

SELECT
  v.slug,
  u.email,
  u.full_name,
  u.role,
  u.verified_at,
  u.deleted_at
FROM users u
JOIN villages v ON v.id = u.village_id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
  AND u.role IN ('COORDINATOR', 'MODERATOR', 'ADMIN')
ORDER BY v.slug, u.role, u.email;

\echo ''
\echo '=== 1.4 Incidents by status ================================'

SELECT
  v.slug,
  i.status,
  count(*)                 AS incidents,
  min(i.reported_at)::date AS first_report,
  max(i.reported_at)::date AS last_report
FROM incidents i
JOIN villages v ON v.id = i.village_id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
GROUP BY v.slug, i.status
ORDER BY v.slug, i.status;

\echo ''
\echo '=== 1.5 The reference collision, which is why renumbering ==='
\echo '===     is not optional                                   ==='
--
-- `survivor_highest` is the highest number the survivor has issued for that
-- year. Every absorbed report is renumbered to that + n, so `new_range` is what
-- the merged sequence will look like. Rows with a NULL year predate the
-- per-village scheme, keep their old strings and are not renumbered — NULLs are
-- distinct in the unique index, so they collide with nothing.

WITH per_village AS (
  SELECT
    (v.slug = :'SURVIVOR_SLUG')    AS is_survivor,
    i.reference_year               AS year,
    count(*)                       AS reports,
    max(i.village_incident_number) AS used
  FROM incidents i
  JOIN villages v ON v.id = i.village_id
  WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
    AND i.reference_year IS NOT NULL
    AND i.village_incident_number IS NOT NULL
  GROUP BY is_survivor, i.reference_year
)
SELECT
  p.year,
  max(p.used)    FILTER (WHERE p.is_survivor)     AS survivor_highest,
  sum(p.reports) FILTER (WHERE NOT p.is_survivor) AS absorbed_reports,
  format(
    '%s..%s',
    coalesce(max(p.used) FILTER (WHERE p.is_survivor), 0) + 1,
    coalesce(max(p.used) FILTER (WHERE p.is_survivor), 0)
      + coalesce(sum(p.reports) FILTER (WHERE NOT p.is_survivor), 0)
  ) AS new_range
FROM per_village p
GROUP BY p.year
HAVING sum(p.reports) FILTER (WHERE NOT p.is_survivor) > 0
ORDER BY p.year;

\echo ''
\echo '--- reports with no number: these keep their old reference -'

SELECT v.slug, count(*) AS unnumbered
FROM incidents i
JOIN villages v ON v.id = i.village_id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
  AND (i.reference_year IS NULL OR i.village_incident_number IS NULL)
GROUP BY v.slug;

\echo ''
\echo '=== 1.6 Audit rows — these do NOT move ====================='
--
-- The count against the absorbed village is what will still be there
-- afterwards, unreachable from the merged village's dashboard. If this number
-- is large and the history matters, read step 8 before committing.

SELECT
  v.slug,
  count(*)                 AS audit_rows,
  count(DISTINCT a.action) AS distinct_actions,
  min(a.created_at)        AS earliest,
  max(a.created_at)        AS latest
FROM audit_logs a
JOIN villages v ON v.id = a.village_id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
GROUP BY v.slug
ORDER BY v.slug;

\echo ''
\echo '=== 1.7 Coordinator applications ==========================='

SELECT
  v.slug,
  c.status,
  count(*) AS requests
FROM coordinator_requests c
JOIN villages v ON v.id = c.village_id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
GROUP BY v.slug, c.status
ORDER BY v.slug, c.status;

\echo ''
\echo '--- would the merge give anybody two pending applications? -'
--
-- It should not: a resident belongs to one village, so they can only have one
-- pending row. Any output here is an anomaly worth understanding before moving
-- the rows, because nothing in the schema forbids it — the one-pending rule is
-- a read-then-create in `coordinator-requests.ts`, not an index.

SELECT c.user_id, count(*) AS pending_after_merge
FROM coordinator_requests c
JOIN villages v ON v.id = c.village_id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
  AND c.status = 'PENDING'
GROUP BY c.user_id
HAVING count(*) > 1;

\echo ''
\echo '=== 1.8 Pattern alerts ====================================='

SELECT v.slug, count(*) AS pattern_alerts
FROM pattern_alerts p
JOIN villages v ON v.id = p.village_id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
GROUP BY v.slug;

\echo ''
\echo '=== 1.9 Police data — the absorbed villages rows are ======='
\echo '===     DELETED, not moved                               ==='
--
-- Three reasons, and none of them is convenience. `police_neighbourhoods` is
-- unique per village and `police_crimes` / `police_data_syncs` are unique per
-- village-month, so moving rows collides wherever the two villages have fetched
-- the same month — which, a mile apart, is every month. And the figures are an
-- answer to a question asked about a specific map centre: Impington's mile
-- relabelled as Histon's would be a number no published figure agrees with, in
-- a document addressed to a PCSO. The weekly sync refetches for the survivor's
-- centre, so nothing is lost that data.police.uk will not publish again.

SELECT
  v.slug,
  (SELECT count(*) FROM police_crimes pc         WHERE pc.village_id = v.id) AS crimes,
  (SELECT count(*) FROM police_data_syncs ps     WHERE ps.village_id = v.id) AS syncs,
  (SELECT count(*) FROM police_neighbourhoods pn WHERE pn.village_id = v.id) AS neighbourhood
FROM villages v
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
ORDER BY v.slug;


-- ===========================================================================
-- Section 2 — THE MERGE
-- ===========================================================================
--
-- One transaction. Change the COMMIT at the foot to ROLLBACK to rehearse.

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 1 — resolve the parameters once, and refuse to run if anything is wrong
-- ---------------------------------------------------------------------------
--
-- A temp table rather than psql variables from here on. psql does not
-- interpolate `:'VAR'` inside a dollar-quoted body, so the guard below could
-- not see them — every parameter it needs, including the raw ACTOR_EMAIL it has
-- to name in an error, is a column here. ON COMMIT DROP, so a rehearsal leaves
-- nothing behind.

CREATE TEMP TABLE merge_params ON COMMIT DROP AS
SELECT
  (SELECT id        FROM villages WHERE slug = :'SURVIVOR_SLUG')             AS survivor_id,
  (SELECT id        FROM villages WHERE slug = :'ABSORBED_SLUG')             AS absorbed_id,
  (SELECT id        FROM users WHERE lower(email) = lower(:'ACTOR_EMAIL'))   AS actor_id,
  (SELECT email     FROM users WHERE lower(email) = lower(:'ACTOR_EMAIL'))   AS actor_email,
  (SELECT role::text FROM users WHERE lower(email) = lower(:'ACTOR_EMAIL'))  AS actor_role,
  :'SURVIVOR_SLUG'::text AS survivor_slug,
  :'ABSORBED_SLUG'::text AS absorbed_slug,
  :'SURVIVOR_NAME'::text AS survivor_name,
  :'ACTOR_EMAIL'::text   AS actor_email_param;

DO $guard$
DECLARE
  p         merge_params%ROWTYPE;
  survivor  villages%ROWTYPE;
  absorbed  villages%ROWTYPE;
  compliant BOOLEAN;
BEGIN
  SELECT * INTO p FROM merge_params;

  IF p.survivor_id IS NULL THEN
    RAISE EXCEPTION 'No village with slug %', p.survivor_slug;
  END IF;

  IF p.absorbed_id IS NULL THEN
    RAISE EXCEPTION 'No village with slug %', p.absorbed_slug;
  END IF;

  IF p.survivor_id = p.absorbed_id THEN
    RAISE EXCEPTION 'The survivor and the absorbed village are the same row';
  END IF;

  -- The actor is not decoration. It is who the trail says did this, and a merge
  -- with nobody against it is the one entry in that table nobody can question.
  IF p.actor_id IS NULL THEN
    RAISE EXCEPTION
      'No users row for % — the audit entry needs an actor. Set ACTOR_EMAIL to an account that exists.',
      p.actor_email_param;
  END IF;

  SELECT * INTO survivor FROM villages WHERE id = p.survivor_id;
  SELECT * INTO absorbed FROM villages WHERE id = p.absorbed_id;

  IF survivor.status <> 'ACTIVE' THEN
    RAISE EXCEPTION
      'The survivor % is %, not ACTIVE. Merging into a village that is not in service would take both offline at once.',
      survivor.slug, survivor.status;
  END IF;

  -- `isComplete()` in src/lib/compliance.ts, in SQL. Not advisory: if the
  -- survivor has not accepted its documents then the moment this commits, every
  -- resident of both villages is refused at `POST /api/incidents`. Accept them
  -- on /dashboard/compliance first and re-run.
  compliant := CASE
    WHEN survivor.mode = 'community' THEN survivor.community_dpa_accepted_at IS NOT NULL
    ELSE (survivor.dpia_accepted_at IS NOT NULL
          AND survivor.apd_accepted_at IS NOT NULL
          AND survivor.dpa_accepted_at IS NOT NULL)
         OR survivor.community_dpa_accepted_at IS NOT NULL
  END;

  IF NOT compliant THEN
    RAISE EXCEPTION
      'The survivor % (mode %) has not accepted the documents its mode requires. Merging now would close reporting for everybody in both villages.',
      survivor.slug, survivor.mode;
  END IF;

  RAISE NOTICE 'Merging % (%) into % (%)',
    absorbed.name, absorbed.slug, survivor.name, survivor.slug;
END;
$guard$;


-- ---------------------------------------------------------------------------
-- Step 2 — the absorbed village's police figures go
-- ---------------------------------------------------------------------------
--
-- First, because it is the only step this file cannot itself reverse and it is
-- also the cheapest to redo: the weekly cron refetches. Doing it before
-- anything moves means a failure here costs nothing already rearranged.
--
-- `police_neighbourhoods` is one row per village and would collide outright;
-- the other two are unique per village-month and would collide on every month
-- both villages hold. See pre-flight 1.9 for why relabelling them would be
-- wrong even where the constraints allowed it.

DELETE FROM police_crimes
WHERE village_id = (SELECT absorbed_id FROM merge_params);

DELETE FROM police_data_syncs
WHERE village_id = (SELECT absorbed_id FROM merge_params);

DELETE FROM police_neighbourhoods
WHERE village_id = (SELECT absorbed_id FROM merge_params);


-- ---------------------------------------------------------------------------
-- Step 3 — residents
-- ---------------------------------------------------------------------------
--
-- The id list is captured BEFORE the update and ends up on the audit row,
-- because after this statement nothing in the database says who used to be in
-- Impington. Without it the reversal described in the header is not possible —
-- `village_id` is the only column that carried the membership.
--
-- `role`, `verified_at` and `verified_by_id` travel untouched. That is the
-- decision recorded in prerequisites 2 and 3, not an oversight: a coordinator
-- of the absorbed village is a coordinator of the merged one after this runs.
--
-- `users_guard_privilege_columns` refuses exactly this write — but only when
-- `current_user` is `authenticated`. This file runs as the table owner through
-- DIRECT_URL, so it passes, and it is the server-side path domain rule 5 asks
-- for rather than a client editing its own row.
--
-- Closed accounts are not excluded because there are none to exclude:
-- `eraseAccount` nulls `village_id` as well as setting `deleted_at`, so a
-- closed account has already left the tenant boundary this predicate scans.

CREATE TEMP TABLE merge_moved_users ON COMMIT DROP AS
SELECT id, email, role::text AS role
FROM users
WHERE village_id = (SELECT absorbed_id FROM merge_params);

UPDATE users
SET village_id = (SELECT survivor_id FROM merge_params)
WHERE id IN (SELECT id FROM merge_moved_users);

-- OPTIONAL — demote the absorbed village's coordinators to verified residents.
-- Uncomment only if that was the decision; leaving it commented is the default
-- and grants them the merged village. Never write COORDINATOR in the other
-- direction here: raising a role is `decideCoordinatorRequest` or
-- `appointCoordinator`, both platform-admin and both audited.
--
-- UPDATE users
-- SET role = 'VERIFIED_RESIDENT'
-- WHERE id IN (SELECT id FROM merge_moved_users WHERE role = 'COORDINATOR');


-- ---------------------------------------------------------------------------
-- Step 4 — rename the survivor (optional, and before the references are built)
-- ---------------------------------------------------------------------------
--
-- Ordered before step 6 deliberately: the reference code is derived from
-- `name`, so renaming afterwards would leave every reference this file writes
-- disagreeing with the one the application would rebuild for the same row —
-- which is what post-flight 3.4 checks for.
--
-- `slug` is untouched and must stay that way: it is in every printed invite
-- sheet and QR code, and there is no redirect behind it.

UPDATE villages
SET name = (SELECT survivor_name FROM merge_params)
WHERE id = (SELECT survivor_id FROM merge_params)
  AND name IS DISTINCT FROM (SELECT survivor_name FROM merge_params);


-- ---------------------------------------------------------------------------
-- Step 5 — pattern alerts and coordinator applications
-- ---------------------------------------------------------------------------
--
-- Neither has a unique key involving the village, so both are a plain move. The
-- id lists are captured for the same reason the residents' were. The
-- `_PatternAlertIncidents` join rows key on incident id and follow by
-- themselves; so do incident media, tags, votes and notifications.

CREATE TEMP TABLE merge_moved_alerts ON COMMIT DROP AS
SELECT id FROM pattern_alerts
WHERE village_id = (SELECT absorbed_id FROM merge_params);

UPDATE pattern_alerts
SET village_id = (SELECT survivor_id FROM merge_params)
WHERE id IN (SELECT id FROM merge_moved_alerts);

CREATE TEMP TABLE merge_moved_requests ON COMMIT DROP AS
SELECT id FROM coordinator_requests
WHERE village_id = (SELECT absorbed_id FROM merge_params);

UPDATE coordinator_requests
SET village_id = (SELECT survivor_id FROM merge_params)
WHERE id IN (SELECT id FROM merge_moved_requests);


-- ---------------------------------------------------------------------------
-- Step 6 — incidents: renumber, rebuild the reference, then move
-- ---------------------------------------------------------------------------
--
-- The mapping is materialised first so it can be printed, stored on the audit
-- row and read back if somebody quotes an old reference next month.
--
-- Ordering is `reported_at, created_at, id`, which is
-- `20260803120000_incident_village_numbering`'s ordering: the sequence is a
-- filing order, and the tiebreak makes a re-run against a restored copy produce
-- the same numbers. Numbers continue from the survivor's highest for that year
-- rather than interleaving by date — an interleaved merge would renumber the
-- survivor's own reports too, which is a far larger blast radius for a tidier
-- sequence nobody reads as continuous anyway.

CREATE TEMP TABLE merge_reference_map ON COMMIT DROP AS
WITH p AS (
  SELECT survivor_id, absorbed_id FROM merge_params
),
survivor_code AS (
  -- villageReferenceCode() in src/lib/incident-reference.ts, in SQL, reading
  -- the name set in step 4.
  SELECT COALESCE(
           NULLIF(UPPER(v.village_code), ''),
           NULLIF(UPPER(LEFT(REGEXP_REPLACE(v.name, '[^A-Za-z]', '', 'g'), 3)), ''),
           'VIL'
         ) AS code
  FROM villages v, p
  WHERE v.id = p.survivor_id
),
survivor_high AS (
  SELECT i.reference_year AS year, MAX(i.village_incident_number) AS used
  FROM incidents i, p
  WHERE i.village_id = p.survivor_id
    AND i.reference_year IS NOT NULL
    AND i.village_incident_number IS NOT NULL
  GROUP BY i.reference_year
),
allocated AS (
  SELECT
    i.id,
    i.reference               AS old_reference,
    i.village_incident_number AS old_number,
    i.reference_year,
    (
      COALESCE(h.used, 0)
      + ROW_NUMBER() OVER (
          PARTITION BY i.reference_year
          ORDER BY i.reported_at, i.created_at, i.id
        )
    )::INTEGER AS new_number
  FROM incidents i
  CROSS JOIN p
  LEFT JOIN survivor_high h ON h.year = i.reference_year
  WHERE i.village_id = p.absorbed_id
    AND i.reference_year IS NOT NULL
    AND i.village_incident_number IS NOT NULL
)
SELECT
  a.id,
  a.old_reference,
  a.old_number,
  a.reference_year,
  a.new_number,
  'VW-' || (SELECT code FROM survivor_code)
        || '-' || a.reference_year::TEXT
        || '-' || LPAD(a.new_number::TEXT, 4, '0') AS new_reference
FROM allocated a;

-- The numbered reports.
UPDATE incidents i
SET village_id              = (SELECT survivor_id FROM merge_params),
    village_incident_number = m.new_number,
    reference               = m.new_reference
FROM merge_reference_map m
WHERE i.id = m.id;

-- The rest — rows filed before the per-village scheme existed. Captured for the
-- audit row, then moved without renumbering: they keep their NULLs and their
-- old strings, which is what the backfill migration left them as. NULLs are
-- distinct in the unique index, so they collide with nothing, and giving them a
-- number would invent a sequence position they never had.
CREATE TEMP TABLE merge_moved_unnumbered ON COMMIT DROP AS
SELECT id, reference AS old_reference
FROM incidents
WHERE village_id = (SELECT absorbed_id FROM merge_params)
  AND (reference_year IS NULL OR village_incident_number IS NULL);

UPDATE incidents
SET village_id = (SELECT survivor_id FROM merge_params)
WHERE id IN (SELECT id FROM merge_moved_unnumbered);

\echo ''
\echo '=== The reference mapping — KEEP THIS OUTPUT =============='

SELECT old_reference, new_reference, reference_year, old_number, new_number
FROM merge_reference_map
ORDER BY reference_year, new_number;


-- ---------------------------------------------------------------------------
-- Step 7 — archive the absorbed village
-- ---------------------------------------------------------------------------
--
-- Archived rather than deleted, and the reason is the audit trail: see ROLLBACK
-- in the header. `DELETE FROM villages` fires ON DELETE SET NULL against
-- `audit_logs.village_id`, which is an UPDATE, which the append-only trigger
-- rejects. The row has to stay.
--
-- The join code is cleared because an archived village holding a live code is a
-- credential nobody is watching. Registration already refuses on `status`
-- before it reads the code, so this is belt to those braces — and `join_code`
-- is unique, so leaving it would additionally reserve the string against
-- re-minting it somewhere it is wanted.
--
-- The compliance timestamps are deliberately left alone. Somebody accepted
-- those documents on a date, and that remains true whatever happens to the
-- village afterwards.

UPDATE villages
SET status    = 'ARCHIVED',
    join_code = NULL
WHERE id = (SELECT absorbed_id FROM merge_params);


-- ---------------------------------------------------------------------------
-- Step 8 — the audit trail is NOT moved
-- ---------------------------------------------------------------------------
--
-- Nothing happens here, on purpose, and the empty step is the documentation.
-- `audit_logs` rows for the absorbed village stay pointing at it and are
-- therefore invisible to the merged village's `/dashboard/audit`, which is
-- scoped by village_id.
--
-- The trigger's own header documents the hatch and it is reproduced here rather
-- than left to be rediscovered. Uncomment ONLY if the analysis decided the
-- history should follow the reports, and understand what it costs: a row that
-- said a decision was taken in Impington will afterwards say it was taken in
-- Histon, which is a rewritten record rather than a moved one. DISABLE TRIGGER
-- also takes an ACCESS EXCLUSIVE lock, so nothing else writes the trail while
-- this transaction is open — and if the UPDATE fails between the two ALTERs the
-- trigger is off until the transaction unwinds, which is why both belong in
-- here rather than in a psql script around it.
--
-- ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_append_only;
--
-- UPDATE audit_logs
-- SET village_id = (SELECT survivor_id FROM merge_params)
-- WHERE village_id = (SELECT absorbed_id FROM merge_params);
--
-- ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_append_only;


-- ---------------------------------------------------------------------------
-- Step 9 — record the merge
-- ---------------------------------------------------------------------------
--
-- Against the SURVIVOR, so it is readable by the coordinators who have to live
-- with the result. INSERT is what the append-only trigger permits; `id` has no
-- database default — Prisma generates it — so it is supplied here.
--
-- `village.merged` is not in AUDIT_ACTIONS, so the viewer renders the raw
-- string: `auditActionLabel` falls back to the action itself. That is the
-- honest outcome for an operator action with no screen behind it, and adding a
-- label to `constants.ts` for something no code path writes would suggest
-- otherwise.
--
-- `before` carries the id lists rather than counts, and that is the whole point
-- of this row. It is the only record of what moved that survives the
-- transaction, and this is the one table nobody can quietly edit afterwards.

INSERT INTO audit_logs (
  id, actor_id, actor_email, actor_role,
  village_id, action, entity_type, entity_id,
  before, after
)
SELECT
  gen_random_uuid(),
  p.actor_id,
  p.actor_email,
  p.actor_role,
  p.survivor_id,
  'village.merged',
  'village',
  p.absorbed_id::text,
  jsonb_build_object(
    'absorbedSlug',      p.absorbed_slug,
    'absorbedVillageId', p.absorbed_id,
    'movedUserIds',
      COALESCE((SELECT jsonb_agg(u.id ORDER BY u.id) FROM merge_moved_users u), '[]'::jsonb),
    'movedPatternAlertIds',
      COALESCE((SELECT jsonb_agg(x.id ORDER BY x.id) FROM merge_moved_alerts x), '[]'::jsonb),
    'movedCoordinatorRequestIds',
      COALESCE((SELECT jsonb_agg(r.id ORDER BY r.id) FROM merge_moved_requests r), '[]'::jsonb),
    'movedUnnumberedIncidentIds',
      COALESCE((SELECT jsonb_agg(n.id ORDER BY n.id) FROM merge_moved_unnumbered n), '[]'::jsonb),
    'referenceMapping',
      COALESCE(
        (SELECT jsonb_agg(
                  jsonb_build_object(
                    'incidentId',   m.id,
                    'from',         m.old_reference,
                    'to',           m.new_reference,
                    'fromNumber',   m.old_number,
                    'toNumber',     m.new_number,
                    'referenceYear', m.reference_year
                  )
                  ORDER BY m.reference_year, m.new_number)
         FROM merge_reference_map m),
        '[]'::jsonb
      )
  ),
  jsonb_build_object(
    'survivorSlug',      p.survivor_slug,
    'survivorVillageId', p.survivor_id,
    'survivorName',      p.survivor_name,
    'usersMoved',        (SELECT count(*) FROM merge_moved_users),
    'incidentsMoved',    (SELECT count(*) FROM merge_reference_map)
                         + (SELECT count(*) FROM merge_moved_unnumbered),
    'incidentsRenumbered', (SELECT count(*) FROM merge_reference_map),
    'absorbedStatus',    'ARCHIVED',
    'auditTrailMoved',   false,
    'policeDataDeleted', true,
    'script',            'scripts/merge-histon-impington.sql'
  )
FROM merge_params p;


-- ---------------------------------------------------------------------------
-- Commit
-- ---------------------------------------------------------------------------
--
-- Rehearse by changing this to ROLLBACK. Everything above is inside the
-- transaction, including all five temp tables, so a rehearsal leaves the
-- database byte-identical and still prints the mapping and the notices.

COMMIT;
-- ROLLBACK;


-- ===========================================================================
-- Section 3 — POST-FLIGHT VERIFICATION
-- ===========================================================================
--
-- Read-only. Run after the commit. Every query has an expected answer;
-- anything else means stop and read, because the transaction has already
-- landed.

\echo ''
\echo '=== 3.1 The absorbed village is empty and archived ========='
\echo '===     expect: 0 everywhere, ARCHIVED, has_join_code f   ==='

SELECT
  v.slug,
  v.status,
  (v.join_code IS NOT NULL) AS has_join_code,
  (SELECT count(*) FROM users u                WHERE u.village_id = v.id) AS users,
  (SELECT count(*) FROM incidents i            WHERE i.village_id = v.id) AS incidents,
  (SELECT count(*) FROM pattern_alerts pa      WHERE pa.village_id = v.id) AS pattern_alerts,
  (SELECT count(*) FROM coordinator_requests c WHERE c.village_id = v.id) AS requests,
  (SELECT count(*) FROM police_crimes pc       WHERE pc.village_id = v.id) AS police_crimes,
  (SELECT count(*) FROM police_data_syncs ps   WHERE ps.village_id = v.id) AS police_syncs
FROM villages v
WHERE v.slug = :'ABSORBED_SLUG';

\echo ''
\echo '=== 3.2 The survivor holds both villages worth ============='
\echo '===     compare against the pre-flight 1.3 and 1.4 sums   ==='

SELECT
  v.slug,
  v.name,
  v.status,
  v.mode,
  (SELECT count(*) FROM users u     WHERE u.village_id = v.id)               AS users,
  (SELECT count(*) FROM users u     WHERE u.village_id = v.id
                                      AND u.role = 'COORDINATOR')            AS coordinators,
  (SELECT count(*) FROM incidents i WHERE i.village_id = v.id)               AS incidents
FROM villages v
WHERE v.slug = :'SURVIVOR_SLUG';

\echo ''
\echo '=== 3.3 No duplicate reference numbers ====================='
\echo '===     expect: no rows. The unique index guarantees it,  ==='
\echo '===     so a row here means the index is missing          ==='

SELECT reference_year, village_incident_number, count(*) AS duplicates
FROM incidents
WHERE village_id = (SELECT id FROM villages WHERE slug = :'SURVIVOR_SLUG')
  AND reference_year IS NOT NULL
  AND village_incident_number IS NOT NULL
GROUP BY reference_year, village_incident_number
HAVING count(*) > 1;

\echo ''
\echo '=== 3.4 Every stored reference agrees with its columns ====='
\echo '===     expect: no rows. A row here is a reference the    ==='
\echo '===     application would rebuild differently             ==='

SELECT i.reference AS stored, i.reference_year, i.village_incident_number
FROM incidents i
JOIN villages v ON v.id = i.village_id
WHERE v.slug = :'SURVIVOR_SLUG'
  AND i.reference_year IS NOT NULL
  AND i.village_incident_number IS NOT NULL
  AND i.reference <> (
    'VW-'
    || COALESCE(
         NULLIF(UPPER(v.village_code), ''),
         NULLIF(UPPER(LEFT(REGEXP_REPLACE(v.name, '[^A-Za-z]', '', 'g'), 3)), ''),
         'VIL'
       )
    || '-' || i.reference_year::TEXT
    || '-' || LPAD(i.village_incident_number::TEXT, 4, '0')
  );

\echo ''
\echo '=== 3.5 The audit trail was not touched ===================='
\echo '===     expect: the absorbed count UNCHANGED from 1.6,    ==='
\echo '===     and the survivor up by exactly one                ==='

SELECT
  v.slug,
  count(a.id)                                            AS audit_rows,
  count(a.id) FILTER (WHERE a.action = 'village.merged') AS merge_rows
FROM villages v
LEFT JOIN audit_logs a ON a.village_id = v.id
WHERE v.slug IN (:'SURVIVOR_SLUG', :'ABSORBED_SLUG')
GROUP BY v.slug
ORDER BY v.slug;

\echo ''
\echo '=== 3.6 The merge entry itself — this is the rollback ======'
\echo '===     record. Check the id lists are populated.         ==='

SELECT
  a.created_at,
  a.actor_email,
  a.actor_role,
  a.after->>'usersMoved'            AS users_moved,
  a.after->>'incidentsMoved'        AS incidents_moved,
  a.after->>'incidentsRenumbered'   AS incidents_renumbered,
  jsonb_array_length(a.before->'movedUserIds')     AS user_ids_recorded,
  jsonb_array_length(a.before->'referenceMapping') AS mapping_entries
FROM audit_logs a
WHERE a.action = 'village.merged'
  AND a.village_id = (SELECT id FROM villages WHERE slug = :'SURVIVOR_SLUG')
ORDER BY a.created_at DESC
LIMIT 5;

\echo ''
\echo '=== 3.7 Nothing anywhere still points at the absorbed ======'
\echo '===     village except the audit trail                    ==='
\echo '===     expect: audit_logs > 0, every other row 0         ==='

WITH absorbed AS (
  SELECT id FROM villages WHERE slug = :'ABSORBED_SLUG'
)
SELECT 'users' AS table_name, count(*) AS rows_remaining
  FROM users u, absorbed a WHERE u.village_id = a.id
UNION ALL SELECT 'incidents',             count(*) FROM incidents i,             absorbed a WHERE i.village_id  = a.id
UNION ALL SELECT 'pattern_alerts',        count(*) FROM pattern_alerts p,        absorbed a WHERE p.village_id  = a.id
UNION ALL SELECT 'coordinator_requests',  count(*) FROM coordinator_requests c,  absorbed a WHERE c.village_id  = a.id
UNION ALL SELECT 'police_crimes',         count(*) FROM police_crimes pc,        absorbed a WHERE pc.village_id = a.id
UNION ALL SELECT 'police_data_syncs',     count(*) FROM police_data_syncs ps,    absorbed a WHERE ps.village_id = a.id
UNION ALL SELECT 'police_neighbourhoods', count(*) FROM police_neighbourhoods n, absorbed a WHERE n.village_id  = a.id
UNION ALL SELECT 'audit_logs',            count(*) FROM audit_logs al,           absorbed a WHERE al.village_id = a.id
ORDER BY table_name;

\echo ''
\echo '=== Done. Three things this file cannot check =============='
\echo '  1. The weekly police sync has not run for the merged'
\echo '     village yet. /dashboard shows no official figures'
\echo '     until it does — the expected state, not a fault.'
\echo '  2. Residents who moved keep the push subscription they'
\echo '     registered with. Nothing about a village change'
\echo '     re-targets OneSignal; the audience is resolved from'
\echo '     the database on every send, so the next alert is'
\echo '     already correct.'
\echo '  3. Whether anybody has told the two coordinators.'
