-- Two nullable columns on `incidents` for the AI severity proposal.
--
-- `reporter_severity` is what the reporter chose in the wizard before the AI
-- pass ran, where they chose anything — step 2 is optional now. `severity_rationale`
-- is the one sentence the model gives for the level it proposed.
--
-- Nullable, no default and no backfill, deliberately. Every row that predates
-- this was filed under the old flow where the reporter's own choice was
-- overwritten and nothing recorded that it had been, so there is no value to
-- backfill *to*: null means "not recorded", which is exactly true of them. A
-- default would invent agreement between a reporter and a model on reports
-- neither of them was asked about.
--
-- No index. Neither column is ever a predicate — both are read alongside a row
-- that has already been found by id or by the village/status/date index — and an
-- index on a column that is null for every historical row would be dead weight.
--
-- AFTER APPLYING: re-run `prisma/sql/rls_policies.sql`. The `incidents` SELECT
-- grant there is enumerated per column, so a new column is invisible through
-- PostgREST until it is named — and `reporter_severity` is deliberately *not*
-- named, which is a decision that file records rather than an omission.
-- `postgis.sql` does not need re-running: no geography column here.

ALTER TABLE "incidents"
  ADD COLUMN "reporter_severity" "severity",
  ADD COLUMN "severity_rationale" TEXT;
