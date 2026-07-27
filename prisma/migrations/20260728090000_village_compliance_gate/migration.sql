-- The legal compliance gate: a village accepts no report until its coordinator
-- has accepted the DPIA and the Appropriate Policy Document.
--
-- Hand-written, like the five migrations before it. `prisma migrate diff`
-- against this database also proposes:
--
--   DROP INDEX "incidents_location_point_idx";
--   DROP INDEX "pattern_alerts_centroid_point_idx";
--   DROP INDEX "villages_boundary_idx";
--
-- Those are the GiST indexes created by `prisma/sql/postgis.sql`. They sit on
-- `Unsupported("geography(...)")` columns, so Prisma cannot see them, reads
-- them as drift, and offers to remove them — which would take out every radius
-- query (`ST_DWithin`) the app makes. They are deliberately not in this file.
-- Check any future generated migration for the same three lines.
--
-- Four columns, nullable, no default. Null means "not accepted", so **every
-- village that exists when this runs stops accepting reports** until somebody
-- opens /dashboard/compliance and accepts. That is the intended direction: the
-- gate exists because processing criminal offence data with no Appropriate
-- Policy Document is unlawful under DPA 2018 Schedule 1 paragraph 5, and a
-- default that let existing villages carry on would be a gate that gates
-- nothing. The dashboard shows an amber banner and the report wizard explains
-- itself rather than erroring.
--
-- `ON DELETE SET NULL` on both foreign keys, matching `moderated_by_id` and
-- `acknowledged_by_id`. A coordinator closing their account must not un-accept
-- their village's documents — the acceptance was an act by the council, and the
-- audit trail holds the denormalised actor email regardless. What is lost is
-- the join back to a live profile, which is why `compliance.dpia_accepted` and
-- `compliance.apd_accepted` are written to `audit_logs` as well as here.
--
-- Two indexes are deliberately NOT created. Both columns are read one village
-- at a time, by primary key, on a table with one row per parish — an index
-- would be scanned past on every query and maintained on every write for
-- nothing.
--
-- Re-run `prisma/sql/rls_policies.sql` after this. The `villages` SELECT grant
-- is enumerated per column, so all four are unreadable through PostgREST until
-- that file names them — which is the intended default for a new column, and
-- the two timestamps are named there now. The two `*_accepted_by_id` columns
-- are deliberately left out: they are `users.id` values, and the RLS section of
-- CLAUDE.md is explicit that a cross-village read of a user id is a thing to
-- withhold rather than a thing to grant by habit.

-- AlterTable
ALTER TABLE "villages" ADD COLUMN     "dpia_accepted_at" TIMESTAMP(3),
                       ADD COLUMN     "dpia_accepted_by_id" UUID,
                       ADD COLUMN     "apd_accepted_at" TIMESTAMP(3),
                       ADD COLUMN     "apd_accepted_by_id" UUID;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_dpia_accepted_by_id_fkey"
  FOREIGN KEY ("dpia_accepted_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "villages" ADD CONSTRAINT "villages_apd_accepted_by_id_fkey"
  FOREIGN KEY ("apd_accepted_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
