-- The reporter's original wording is deleted when a report is archived.
--
-- `/privacy` §7 has stated since the notice was first written that the verbatim
-- submission goes at `RETENTION.incidentArchiveMonths`. Nothing did it: the
-- nightly sweep in `src/app/api/cron/retention/route.ts` flipped `status` to
-- `ARCHIVED` and touched no other column, so every report archived so far kept
-- the names, registrations and addresses its reporter typed. A stated retention
-- period that does not happen is a compliance gap in its own right (DPIA §7
-- says so in as many words), and this is the half of it that is code.
--
-- Two statements, and the order matters only in that the second cannot run
-- before the first.
--
-- 1. **`raw_description` becomes nullable.** Null is the deletion. It is
--    deliberately not a placeholder string like the tombstone `src/lib/erasure.ts`
--    writes: a sentinel is a value a reporter could have typed, and this is the
--    one column in the schema holding a resident's unedited words. Widening a
--    NOT NULL constraint is safe to apply to a live table — nothing existing
--    violates it, and no row is rewritten.
--
-- 2. **Reports already archived are cleared.** Without this, the notice would
--    be true only for reports archived from tonight onwards, and the rows that
--    have been sitting past their retention date the longest would be the ones
--    that kept their wording. Irreversible, and intended: it is the same act
--    the nightly job now performs, applied to the backlog it should already
--    have covered. On this deployment it affects nothing — no report has ever
--    reached 12 months and no cron has ever fired — which is exactly why it is
--    cheap to do now rather than after the first archive run.
--
-- `raw_description` is not in the `incidents` SELECT grant in
-- `prisma/sql/rls_policies.sql` and does not become readable here; this alters a
-- column rather than adding one, so the grants are unchanged. `database.yml`
-- re-runs both SQL files after every migration regardless.

-- AlterTable
ALTER TABLE "incidents" ALTER COLUMN "raw_description" DROP NOT NULL;

-- Backfill: the archive backlog this job should already have cleared.
UPDATE "incidents" SET "raw_description" = NULL WHERE "status" = 'ARCHIVED';
