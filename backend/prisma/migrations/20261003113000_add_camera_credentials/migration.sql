-- ==============================================================================
-- NETRAVAHA — Phase 2 Migration: Add Camera Credential Storage
-- Gujarat Police Innovation Challenge 2026
-- ==============================================================================

-- CreateEnum: CredentialType
CREATE TYPE "CredentialType" AS ENUM ('BASIC_AUTH', 'ONVIF_TOKEN', 'BEARER_TOKEN', 'CUSTOM');

-- CreateTable: camera_credentials
CREATE TABLE "camera_credentials" (
    "id" UUID NOT NULL,
    "camera_id" UUID NOT NULL,
    "credential_type" "CredentialType" NOT NULL DEFAULT 'BASIC_AUTH',
    "encrypted_data" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "key_version" TEXT NOT NULL DEFAULT 'v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camera_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "camera_credentials_camera_id_key" ON "camera_credentials"("camera_id");

-- AddForeignKey
ALTER TABLE "camera_credentials" ADD CONSTRAINT "camera_credentials_camera_id_fkey" FOREIGN KEY ("camera_id") REFERENCES "cameras"("id") ON DELETE CASCADE ON UPDATE CASCADE;
