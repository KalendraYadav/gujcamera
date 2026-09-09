-- ==============================================================================
-- Unified CCTV Intelligence Platform — Baseline Migration (Phase 1)
-- Gujarat Police Innovation Challenge 2026
-- Source of Truth: master_architecture.md (Section 6)
-- ==============================================================================

-- Ensure PostGIS spatial extension is active
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum: OperationalStatus
CREATE TYPE "OperationalStatus" AS ENUM ('ONLINE', 'CONNECTING', 'DEGRADED', 'OFFLINE', 'ERROR');

-- CreateEnum: CameraProtocol
CREATE TYPE "CameraProtocol" AS ENUM ('RTSP', 'ONVIF', 'MOCK_VENDOR', 'VENDOR_API');

-- CreateEnum: DetectionType
CREATE TYPE "DetectionType" AS ENUM ('VEHICLE', 'PERSON');

-- CreateEnum: AlertSeverity
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum: AlertStatus
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateEnum: IncidentStatus
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'CLOSED');

-- CreateEnum: EvidenceSourceType
CREATE TYPE "EvidenceSourceType" AS ENUM ('SIGHTING', 'ALERT');

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONAL & RBAC CORE
-- ------------------------------------------------------------------------------

-- CreateTable: departments
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_department_id" UUID,
    "retention_policy_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: roles
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: permissions
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- ------------------------------------------------------------------------------
-- 2. CAMERA REGISTRY & GIS MODULE
-- ------------------------------------------------------------------------------

-- CreateTable: connectors
CREATE TABLE "connectors" (
    "id" UUID NOT NULL,
    "adapter_type" TEXT NOT NULL,
    "config_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable: cameras
CREATE TABLE "cameras" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" UUID NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "long" DECIMAL(10,7) NOT NULL,
    "protocol" "CameraProtocol" NOT NULL DEFAULT 'RTSP',
    "connector_type_id" UUID NOT NULL,
    "operational_status" "OperationalStatus" NOT NULL DEFAULT 'OFFLINE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

-- CreateTable: locations
CREATE TABLE "locations" (
    "camera_id" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("camera_id")
);

-- CreateTable: camera_streams
CREATE TABLE "camera_streams" (
    "id" UUID NOT NULL,
    "camera_id" UUID NOT NULL,
    "codec" TEXT NOT NULL DEFAULT 'h264',
    "resolution" TEXT NOT NULL DEFAULT '1920x1080',
    "fps" INTEGER NOT NULL DEFAULT 15,
    "url_or_handle" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camera_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable: camera_health
CREATE TABLE "camera_health" (
    "camera_id" UUID NOT NULL,
    "last_heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fps_actual" DECIMAL(5,2),
    "packet_loss" DECIMAL(5,2),
    "status" "OperationalStatus" NOT NULL DEFAULT 'ONLINE',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camera_health_pkey" PRIMARY KEY ("camera_id")
);

-- ------------------------------------------------------------------------------
-- 3. AI DETECTIONS, VEHICLES & CONSENSUS SIGHTINGS
-- ------------------------------------------------------------------------------

-- CreateTable: detections
CREATE TABLE "detections" (
    "id" UUID NOT NULL,
    "camera_id" UUID NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "type" "DetectionType" NOT NULL DEFAULT 'VEHICLE',
    "bbox" JSONB NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable: plate_detections
CREATE TABLE "plate_detections" (
    "id" UUID NOT NULL,
    "detection_id" UUID NOT NULL,
    "raw_text" TEXT NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "frame_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plate_detections_pkey" PRIMARY KEY ("id")
);

-- CreateTable: vehicles
CREATE TABLE "vehicles" (
    "plate_normalized" TEXT NOT NULL,
    "first_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attributes" JSONB,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("plate_normalized")
);

-- CreateTable: vehicle_sightings
CREATE TABLE "vehicle_sightings" (
    "id" UUID NOT NULL,
    "plate_normalized" TEXT NOT NULL,
    "camera_id" UUID NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "consensus_of" INTEGER NOT NULL DEFAULT 1,
    "frame_ref" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_sightings_pkey" PRIMARY KEY ("id")
);

-- ------------------------------------------------------------------------------
-- 4. WATCHLIST & ALERT ENGINE
-- ------------------------------------------------------------------------------

-- CreateTable: watchlists
CREATE TABLE "watchlists" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "department_id" UUID NOT NULL,
    "owner" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable: watchlist_entries
CREATE TABLE "watchlist_entries" (
    "id" UUID NOT NULL,
    "watchlist_id" UUID NOT NULL,
    "plate_normalized" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" "AlertSeverity" NOT NULL DEFAULT 'HIGH',
    "added_by" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable: alerts
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "source_sighting_id" UUID NOT NULL,
    "watchlist_entry_id" UUID NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_by_id" UUID,
    "resolved_by_id" UUID,
    "dismissal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: incidents
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "opened_by_id" UUID NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "related_alert_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- ------------------------------------------------------------------------------
-- 5. EVIDENCE & AUDIT LOGGING
-- ------------------------------------------------------------------------------

-- CreateTable: evidence
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "source_type" "EvidenceSourceType" NOT NULL,
    "source_id" UUID NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" UUID,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- ------------------------------------------------------------------------------
-- 6. INDEXES (B-Tree & GiST Spatial)
-- ------------------------------------------------------------------------------

-- Unique & Lookup Indexes
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");
CREATE INDEX "permissions_role_id_idx" ON "permissions"("role_id");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_role_id_idx" ON "users"("role_id");
CREATE INDEX "users_department_id_idx" ON "users"("department_id");

-- Camera Fleet & Health Indexes
CREATE INDEX "cameras_department_id_operational_status_idx" ON "cameras"("department_id", "operational_status");
CREATE INDEX "camera_streams_camera_id_idx" ON "camera_streams"("camera_id");

-- PostGIS GiST Spatial Index on Camera GPS Coordinates (Section 6.2)
CREATE INDEX "cameras_location_gist_idx" ON "cameras" USING GIST (ST_SetSRID(ST_MakePoint("long", "lat"), 4326));

-- Detections & Sightings Indexes
CREATE INDEX "detections_camera_id_ts_idx" ON "detections"("camera_id", "ts");
CREATE INDEX "plate_detections_detection_id_idx" ON "plate_detections"("detection_id");
CREATE INDEX "vehicles_last_seen_idx" ON "vehicles"("last_seen");
CREATE INDEX "vehicle_sightings_plate_normalized_ts_idx" ON "vehicle_sightings"("plate_normalized", "ts");
CREATE INDEX "vehicle_sightings_camera_id_ts_idx" ON "vehicle_sightings"("camera_id", "ts");

-- Watchlist & Alert Indexes
CREATE INDEX "watchlist_entries_plate_normalized_active_idx" ON "watchlist_entries"("plate_normalized", "active");
CREATE INDEX "alerts_status_ts_idx" ON "alerts"("status", "ts");

-- Evidence & Audit Indexes
CREATE INDEX "evidence_source_id_idx" ON "evidence"("source_id");
CREATE INDEX "audit_logs_resource_ts_idx" ON "audit_logs"("resource", "ts");

-- ------------------------------------------------------------------------------
-- 7. FOREIGN KEY CONSTRAINTS
-- ------------------------------------------------------------------------------

ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_department_id_fkey" FOREIGN KEY ("parent_department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_connector_type_id_fkey" FOREIGN KEY ("connector_type_id") REFERENCES "connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "locations" ADD CONSTRAINT "locations_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "camera_streams" ADD CONSTRAINT "camera_streams_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "camera_health" ADD CONSTRAINT "camera_health_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "detections" ADD CONSTRAINT "detections_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plate_detections" ADD CONSTRAINT "plate_detections_detection_id_fkey" FOREIGN KEY ("detection_id") REFERENCES "detections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_sightings" ADD CONSTRAINT "vehicle_sightings_plate_normalized_fkey" FOREIGN KEY ("plate_normalized") REFERENCES "vehicles"("plate_normalized") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_sightings" ADD CONSTRAINT "vehicle_sightings_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlists" ADD CONSTRAINT "watchlists_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "watchlist_entries" ADD CONSTRAINT "watchlist_entries_watchlist_id_fkey" FOREIGN KEY ("watchlist_id") REFERENCES "watchlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_source_sighting_id_fkey" FOREIGN KEY ("source_sighting_id") REFERENCES "vehicle_sightings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watchlist_entry_id_fkey" FOREIGN KEY ("watchlist_entry_id") REFERENCES "watchlist_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
