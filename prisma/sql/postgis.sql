-- PostGIS support for VillageWatch.
--
-- Prisma declares `location_point`, `centroid_point` and `boundary` as
-- `Unsupported("geography(...)")`, which means Prisma Client can neither read
-- nor write them. Run this script once, AFTER your first `prisma migrate dev`,
-- to enable the extension, index the geography columns, and keep them in sync
-- with the plain lat/lng columns the application actually writes.
--
--   psql "$DIRECT_URL" -f prisma/sql/postgis.sql
--
-- On Supabase, PostGIS is available but must be enabled per project — either
-- run the CREATE EXTENSION below or toggle it in Database → Extensions.

CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- incidents.location_point  <-  incidents.lat / lng
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION incidents_sync_location_point()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.lat IS NULL OR NEW.lng IS NULL THEN
    NEW.location_point := NULL;
  ELSE
    NEW.location_point := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incidents_location_point_trigger ON incidents;
CREATE TRIGGER incidents_location_point_trigger
  BEFORE INSERT OR UPDATE OF lat, lng ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION incidents_sync_location_point();

CREATE INDEX IF NOT EXISTS incidents_location_point_idx
  ON incidents USING GIST (location_point);

-- ---------------------------------------------------------------------------
-- pattern_alerts.centroid_point  <-  pattern_alerts.centroid_lat / centroid_lng
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pattern_alerts_sync_centroid_point()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.centroid_lat IS NULL OR NEW.centroid_lng IS NULL THEN
    NEW.centroid_point := NULL;
  ELSE
    NEW.centroid_point := ST_SetSRID(
      ST_MakePoint(NEW.centroid_lng, NEW.centroid_lat), 4326
    )::geography;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pattern_alerts_centroid_point_trigger ON pattern_alerts;
CREATE TRIGGER pattern_alerts_centroid_point_trigger
  BEFORE INSERT OR UPDATE OF centroid_lat, centroid_lng ON pattern_alerts
  FOR EACH ROW
  EXECUTE FUNCTION pattern_alerts_sync_centroid_point();

CREATE INDEX IF NOT EXISTS pattern_alerts_centroid_point_idx
  ON pattern_alerts USING GIST (centroid_point);

-- ---------------------------------------------------------------------------
-- villages.boundary
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS villages_boundary_idx
  ON villages USING GIST (boundary);

-- ---------------------------------------------------------------------------
-- Backfill anything written before the triggers existed.
-- ---------------------------------------------------------------------------

UPDATE incidents
   SET location_point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
 WHERE lat IS NOT NULL
   AND lng IS NOT NULL
   AND location_point IS NULL;

UPDATE pattern_alerts
   SET centroid_point = ST_SetSRID(
         ST_MakePoint(centroid_lng, centroid_lat), 4326
       )::geography
 WHERE centroid_lat IS NOT NULL
   AND centroid_lng IS NOT NULL
   AND centroid_point IS NULL;

-- ---------------------------------------------------------------------------
-- Reference: radius query from application code
-- ---------------------------------------------------------------------------
--
--   const rows = await prisma.$queryRaw<{ id: string; distance_m: number }[]>`
--     SELECT id,
--            ST_Distance(
--              location_point,
--              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
--            ) AS distance_m
--       FROM incidents
--      WHERE village_id = ${villageId}::uuid
--        AND status = 'PUBLISHED'
--        AND ST_DWithin(
--              location_point,
--              ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
--              ${radiusMeters}
--            )
--      ORDER BY distance_m ASC
--      LIMIT 100;
--   `;
