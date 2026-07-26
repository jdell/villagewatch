-- CreateEnum
CREATE TYPE "incident_type" AS ENUM ('THEFT', 'BURGLARY', 'VANDALISM', 'ASSAULT', 'ANTISOCIAL_BEHAVIOUR', 'SUSPICIOUS_ACTIVITY', 'TRESPASSING', 'VEHICLE_CRIME', 'DRUG_ACTIVITY', 'FRAUD_SCAM', 'FIRE', 'FLOOD', 'ROAD_HAZARD', 'WILDLIFE', 'MISSING_PERSON', 'MISSING_PET', 'OTHER');

-- CreateEnum
CREATE TYPE "severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "incident_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'RESOLVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "report_source" AS ENUM ('WEB', 'MOBILE', 'WHATSAPP', 'SMS', 'PHONE', 'IMPORTED');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('RESIDENT', 'VERIFIED_RESIDENT', 'COORDINATOR', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "village_status" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "villages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "village_status" NOT NULL DEFAULT 'PENDING',
    "center_lat" DOUBLE PRECISION NOT NULL,
    "center_lng" DOUBLE PRECISION NOT NULL,
    "default_zoom" INTEGER NOT NULL DEFAULT 14,
    "radius_meters" INTEGER NOT NULL DEFAULT 5000,
    "boundary" geography(Polygon, 4326),
    "region" TEXT,
    "postcode" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'GB',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
    "population" INTEGER,
    "join_code" TEXT,
    "alert_threshold" "severity" NOT NULL DEFAULT 'HIGH',
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "villages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "avatar_url" TEXT,
    "role" "user_role" NOT NULL DEFAULT 'RESIDENT',
    "village_id" UUID,
    "address_line" TEXT,
    "home_lat" DOUBLE PRECISION,
    "home_lng" DOUBLE PRECISION,
    "verified_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "notify_push" BOOLEAN NOT NULL DEFAULT true,
    "notify_email" BOOLEAN NOT NULL DEFAULT true,
    "notify_sms" BOOLEAN NOT NULL DEFAULT false,
    "notify_min_severity" "severity" NOT NULL DEFAULT 'LOW',
    "notify_radius_meters" INTEGER,
    "push_subscription" JSONB,
    "onboarded_at" TIMESTAMP(3),
    "last_active_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "village_id" UUID NOT NULL,
    "reporter_id" UUID,
    "type" "incident_type" NOT NULL,
    "severity" "severity" NOT NULL DEFAULT 'MEDIUM',
    "status" "incident_status" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source" "report_source" NOT NULL DEFAULT 'WEB',
    "title" TEXT NOT NULL,
    "raw_description" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ai_summary" TEXT,
    "ai_model" TEXT,
    "ai_processed_at" TIMESTAMP(3),
    "ai_confidence" DOUBLE PRECISION,
    "anonymized" BOOLEAN NOT NULL DEFAULT false,
    "people_count" INTEGER,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "pattern_note" TEXT,
    "is_anonymous" BOOLEAN NOT NULL DEFAULT false,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "location_text" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "location_point" geography(Point, 4326),
    "location_fuzz_meters" INTEGER NOT NULL DEFAULT 100,
    "reported_to_police" BOOLEAN NOT NULL DEFAULT false,
    "police_reference" TEXT,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "confirm_count" INTEGER NOT NULL DEFAULT 0,
    "moderated_by_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "moderation_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_media" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "public_url" TEXT,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "caption" TEXT,
    "redacted_path" TEXT,
    "redacted_at" TIMESTAMP(3),
    "ai_labels" JSONB,
    "exif_stripped" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_tags" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "incident_id" UUID,
    "pattern_alert_id" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'push',
    "url" TEXT,
    "data" JSONB,
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_alerts" (
    "id" UUID NOT NULL,
    "village_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "type" "incident_type",
    "severity" "severity" NOT NULL DEFAULT 'MEDIUM',
    "incident_count" INTEGER NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "centroid_lat" DOUBLE PRECISION,
    "centroid_lng" DOUBLE PRECISION,
    "radius_meters" INTEGER,
    "centroid_point" geography(Point, 4326),
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "detector" TEXT NOT NULL DEFAULT 'dbscan',
    "notified_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" UUID,
    "dismissed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pattern_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_email" TEXT,
    "actor_role" TEXT,
    "village_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PatternAlertIncidents" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_PatternAlertIncidents_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "villages_slug_key" ON "villages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "villages_join_code_key" ON "villages"("join_code");

-- CreateIndex
CREATE INDEX "villages_status_idx" ON "villages"("status");

-- CreateIndex
CREATE INDEX "villages_country_region_idx" ON "villages"("country", "region");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_village_id_role_idx" ON "users"("village_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_reference_key" ON "incidents"("reference");

-- CreateIndex
CREATE INDEX "incidents_village_id_status_occurred_at_idx" ON "incidents"("village_id", "status", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "incidents_village_id_type_idx" ON "incidents"("village_id", "type");

-- CreateIndex
CREATE INDEX "incidents_village_id_severity_idx" ON "incidents"("village_id", "severity");

-- CreateIndex
CREATE INDEX "incidents_reporter_id_idx" ON "incidents"("reporter_id");

-- CreateIndex
CREATE INDEX "incidents_lat_lng_idx" ON "incidents"("lat", "lng");

-- CreateIndex
CREATE INDEX "incident_media_incident_id_position_idx" ON "incident_media"("incident_id", "position");

-- CreateIndex
CREATE INDEX "incident_tags_label_idx" ON "incident_tags"("label");

-- CreateIndex
CREATE UNIQUE INDEX "incident_tags_incident_id_label_key" ON "incident_tags"("incident_id", "label");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_incident_id_idx" ON "notifications"("incident_id");

-- CreateIndex
CREATE INDEX "pattern_alerts_village_id_created_at_idx" ON "pattern_alerts"("village_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "pattern_alerts_village_id_acknowledged_at_idx" ON "pattern_alerts"("village_id", "acknowledged_at");

-- CreateIndex
CREATE INDEX "audit_logs_village_id_created_at_idx" ON "audit_logs"("village_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "_PatternAlertIncidents_B_index" ON "_PatternAlertIncidents"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_moderated_by_id_fkey" FOREIGN KEY ("moderated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_media" ADD CONSTRAINT "incident_media_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_tags" ADD CONSTRAINT "incident_tags_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_pattern_alert_id_fkey" FOREIGN KEY ("pattern_alert_id") REFERENCES "pattern_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_alerts" ADD CONSTRAINT "pattern_alerts_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_alerts" ADD CONSTRAINT "pattern_alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_village_id_fkey" FOREIGN KEY ("village_id") REFERENCES "villages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PatternAlertIncidents" ADD CONSTRAINT "_PatternAlertIncidents_A_fkey" FOREIGN KEY ("A") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PatternAlertIncidents" ADD CONSTRAINT "_PatternAlertIncidents_B_fkey" FOREIGN KEY ("B") REFERENCES "pattern_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
