-- Right to erasure, and a rate limiter that survives a cold start.
--
-- Two unrelated features in one migration because both are one column and one
-- table respectively, and splitting them would mean two hand-written files that
-- have to be applied in order for no reason.
--
-- Hand-written rather than generated, for the same reason as
-- `20260727113000_coordinator_requests` and `20260727060612_whatsapp_channel`:
-- `prisma migrate diff` against this database also proposes
--
--   DROP INDEX "incidents_location_point_idx";
--   DROP INDEX "pattern_alerts_centroid_point_idx";
--   DROP INDEX "villages_boundary_idx";
--
-- which are the GiST indexes from `prisma/sql/postgis.sql` on the
-- `Unsupported("geography(...)")` columns Prisma cannot see. Dropping them would
-- take out every `ST_DWithin` radius query in the app. Check any future
-- generated migration for the same three lines.
--
-- AFTER APPLYING THIS, re-run `prisma/sql/rls_policies.sql`. `rate_limit` is a
-- new table and arrives with row-level security OFF — and it is the one table in
-- the schema that `authenticated` should not be able to touch at all, because a
-- client that can read its own counter knows how much quota is left before
-- spending it and a client that can write one can clear it. The incidents
-- section also changed: `REMOVED` has to be excluded from the two SELECT
-- policies that are not already narrowed to the public statuses.

-- ---------------------------------------------------------------------------
-- Right to erasure
-- ---------------------------------------------------------------------------

-- A report the reporter has erased (UK GDPR Article 17). The row survives so
-- that the audit trail's `entity_id` still resolves and the reference is never
-- reissued; the wording, the landmark, the coordinates, the tags and the media
-- do not. See `src/lib/erasure.ts`.
--
-- `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that adds
-- it, which is fine — nothing below writes the value.
ALTER TYPE "incident_status" ADD VALUE 'REMOVED';

-- When the resident closed their own account. The row stays: `audit_logs.actor_id`
-- and `incidents.reporter_id` both point at it, and severing those would break a
-- trail that is meant to be append-only (domain rule 7). The columns holding
-- anything personal are scrubbed in the same write that sets this.
ALTER TABLE "users" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- Persistent rate limiting
-- ---------------------------------------------------------------------------

-- Replaces the in-memory `Map` in `src/lib/rate-limit.ts`, whose counters lived
-- in the lambda instance and reset on every cold start.
CREATE TABLE "rate_limit" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

-- What makes the counter atomic: `INSERT ... ON CONFLICT (user_id, action,
-- window_start) DO UPDATE SET count = count + 1` is one statement, so two
-- concurrent requests cannot both read 4 and both write 5.
CREATE UNIQUE INDEX "rate_limit_user_id_action_window_start_key" ON "rate_limit"("user_id", "action", "window_start");

-- For the nightly sweep, which deletes by age and by nothing else.
CREATE INDEX "rate_limit_window_start_idx" ON "rate_limit"("window_start");
