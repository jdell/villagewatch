-- Coordinator access requests.
--
-- A resident applies from /settings, a platform administrator approves, and the
-- approval is what writes `users.role = 'COORDINATOR'`. Until this table there
-- was no way to become a coordinator at all short of an UPDATE by hand.
--
-- Hand-written rather than generated, for the same reason as
-- `20260727060612_whatsapp_channel`: `prisma migrate diff` against this database
-- also proposes
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
-- AFTER APPLYING THIS, re-run `prisma/sql/rls_policies.sql`. A new table arrives
-- with row-level security OFF, and the file now carries a `coordinator_requests`
-- section — an application holds a resident's name against their own words about
-- why they want to read their neighbours' verbatim reports.

-- CreateEnum
CREATE TYPE "coordinator_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "coordinator_requests" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "role_detail" TEXT,
    "reason" TEXT NOT NULL,
    "status" "coordinator_request_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coordinator_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coordinator_requests_status_created_at_idx" ON "coordinator_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "coordinator_requests_user_id_created_at_idx" ON "coordinator_requests"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "coordinator_requests_village_id_status_idx" ON "coordinator_requests"("village_id", "status");

-- AddForeignKey
ALTER TABLE "coordinator_requests" ADD CONSTRAINT "coordinator_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinator_requests" ADD CONSTRAINT "coordinator_requests_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coordinator_requests" ADD CONSTRAINT "coordinator_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
