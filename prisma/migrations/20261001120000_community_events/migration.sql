-- Community events: things happening in a village that are not problems.
--
-- One new table and one new column. Nothing a resident can do changes when it
-- lands — `events_enabled` defaults to false, so no village shows events until a
-- coordinator turns them on.
--
-- **Re-run `prisma/sql/rls_policies.sql` after this migration.** The table
-- arrives with RLS off, and `villages` grants SELECT per column, so
-- `events_enabled` is invisible through PostgREST until it is named there.
-- `postgis.sql` need not be re-run: there is no geography column, on purpose.

ALTER TABLE "villages" ADD COLUMN "events_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "community_events" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "location_text" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "community_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "community_events_village_id_starts_at_idx"
    ON "community_events" ("village_id", "starts_at");

CREATE INDEX "community_events_created_by_id_idx"
    ON "community_events" ("created_by_id");

ALTER TABLE "community_events" ADD CONSTRAINT "community_events_village_id_fkey"
    FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "community_events" ADD CONSTRAINT "community_events_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
