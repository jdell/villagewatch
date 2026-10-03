-- "It's over now" on the report page. Nullable, no default, no backfill: null
-- means nobody has said so, which is true of every existing report.
--
-- Re-run prisma/sql/rls_policies.sql afterwards — the `incidents` SELECT grant
-- is enumerated per column, so `ended_at` is invisible through PostgREST until
-- it is named there. Nothing in the app reads it through PostgREST, so until
-- then the cost is nil.
ALTER TABLE "incidents" ADD COLUMN "ended_at" TIMESTAMP(3);
