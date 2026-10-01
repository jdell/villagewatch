-- What a coordinator said happened about a report when they resolved it.
--
-- Nullable, no default, and no backfill: a report resolved before this column
-- existed has no note, which is the truth. It is public — written by a
-- coordinator for the village to read — so rls_policies.sql grants it to
-- `authenticated` beside `resolved_at`. Re-run that file after this migration:
-- the incidents SELECT grant is enumerated per column, so until it is re-run the
-- column is invisible through PostgREST.
ALTER TABLE "incidents" ADD COLUMN "resolution_note" TEXT;
