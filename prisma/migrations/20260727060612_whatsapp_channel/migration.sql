-- WhatsApp Channel fields on Village.
--
-- Hand-written rather than generated. `prisma migrate diff` against this
-- database also proposes:
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

-- AlterTable
ALTER TABLE "villages" ADD COLUMN     "whatsapp_channel_id" TEXT,
ADD COLUMN     "whatsapp_channel_url" TEXT,
ADD COLUMN     "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsapp_min_severity" "severity" NOT NULL DEFAULT 'HIGH';
