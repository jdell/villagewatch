-- Per-village incident references: VW-2026-0184 becomes VW-HIS-2026-0003.
--
-- The old reference was a single platform-wide sequence, so the first report a
-- parish ever filed was numbered by how busy every other parish had been. The
-- number is now the village's own and it resets each January.
--
-- Three things happen here and the order matters: the columns arrive, the
-- global unique index on `reference` goes, existing rows are renumbered, and
-- only then does the composite key that replaces it get built — over data that
-- already satisfies it.

-- 1. The hand-set override. Null on every row, which is the normal state: the
--    code is derived from the village name unless somebody has had to separate
--    two villages that derive the same three letters.
ALTER TABLE "villages" ADD COLUMN "village_code" TEXT;

-- 2. The sequence itself. Nullable because every row already in the table was
--    written before this existed.
ALTER TABLE "incidents" ADD COLUMN "reference_year" INTEGER;
ALTER TABLE "incidents" ADD COLUMN "village_incident_number" INTEGER;

-- 3. `reference` stops being globally unique.
--
--    It has to. The village code is the first three letters of the village
--    name, and that is not unique across 10,670 parishes — every "Great …"
--    derives GRE. Keeping a global unique index would mean the second GRE
--    village to file its third report of the year could not file it at all:
--    the number it computed for itself would already be spoken for, and the
--    retry would compute the same number again. References are unique per
--    village now, which is what the index in step 5 enforces.
DROP INDEX "incidents_reference_key";

-- 4. Renumber what is already there.
--
--    Ordered by `reported_at` — the sequence is a filing order, not a calendar
--    of events, so `occurred_at` is deliberately not what partitions or orders
--    it. `created_at` and `id` break ties so the result is deterministic on a
--    re-run against a restored copy.
--
--    Rows could have been left with NULLs and their old references: Postgres
--    treats NULLs as distinct in a unique index, so they would neither collide
--    with each other nor block step 5. They are backfilled anyway because the
--    alternative is a village whose log reads VW-2026-0003, VW-HIS-2026-0001 —
--    two schemes in one column, and a coordinator with no way to know which
--    reports are numbered against what.
--    `reported_at` is TIMESTAMP(3) without a time zone and Prisma stores it in
--    UTC, so EXTRACT reads the UTC year directly. `AT TIME ZONE 'UTC'` would be
--    worse than redundant here: it converts to timestamptz, after which EXTRACT
--    renders in the *session's* zone and the year a report lands in depends on
--    who ran the migration.
WITH numbered AS (
  SELECT
    id,
    EXTRACT(YEAR FROM reported_at)::INTEGER AS year,
    (
      ROW_NUMBER() OVER (
        PARTITION BY village_id, EXTRACT(YEAR FROM reported_at)
        ORDER BY reported_at, created_at, id
      )
    )::INTEGER AS number
  FROM "incidents"
)
UPDATE "incidents" AS i
SET
  "reference_year" = n.year,
  "village_incident_number" = n.number
FROM numbered AS n
WHERE i.id = n.id;

-- Then rebuild the string from the two columns, exactly as
-- `buildIncidentReference` in `src/lib/incident-reference.ts` does.
--
-- The `[^A-Za-z]` class and the `VIL` fallback are that function's rules
-- written in SQL. Keep the two in step: a stored reference that disagrees with
-- the one the application would build for the same row is the failure this is
-- meant to prevent.
UPDATE "incidents" AS i
SET "reference" =
  'VW-'
  || COALESCE(
       NULLIF(UPPER(v."village_code"), ''),
       NULLIF(UPPER(LEFT(REGEXP_REPLACE(v."name", '[^A-Za-z]', '', 'g'), 3)), ''),
       'VIL'
     )
  || '-'
  || i."reference_year"::TEXT
  || '-'
  || LPAD(i."village_incident_number"::TEXT, 4, '0')
FROM "villages" AS v
WHERE v.id = i."village_id"
  AND i."reference_year" IS NOT NULL
  AND i."village_incident_number" IS NOT NULL;

-- 5. What actually stops two reports filed in the same second from sharing a
--    number. The application reads MAX(village_incident_number) + 1, which two
--    concurrent requests can both read; this is what turns the loser into the
--    P2002 that `POST /api/incidents` retries.
CREATE UNIQUE INDEX "incidents_village_year_number_key"
  ON "incidents"("village_id", "reference_year", "village_incident_number");
