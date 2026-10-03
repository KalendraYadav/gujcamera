-- Phase 10: Add vehicle_class to vehicle_sightings
-- Persists the YOLO-detected vehicle class (CAR, MOTORCYCLE, BUS, TRUCK, OTHER_VEHICLE)
-- alongside each sighting record for use in spatio-temporal correlation scoring.
-- Column is nullable to preserve backward compatibility with sightings recorded before
-- Phase 10 deployment.

ALTER TABLE "vehicle_sightings"
  ADD COLUMN "vehicle_class" TEXT;
