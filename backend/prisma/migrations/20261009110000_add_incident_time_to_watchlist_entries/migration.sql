-- Phase 3: Add incident_start and incident_end to watchlist_entries
-- Supports incident-time awareness for historical vehicle sightings.
-- Both columns are nullable to preserve complete backward compatibility with all existing records.
--
-- Deployment Considerations:
-- 1. Non-blocking column additions with NULL defaults. No table lock or downtime required.
-- 2. Fully compatible with existing WatchlistEntry records.
--
-- Forward Migration:
ALTER TABLE "watchlist_entries"
  ADD COLUMN IF NOT EXISTS "incident_start" TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS "incident_end" TIMESTAMP WITHOUT TIME ZONE;

-- Rollback SQL:
-- ALTER TABLE "watchlist_entries" DROP COLUMN IF EXISTS "incident_start", DROP COLUMN IF EXISTS "incident_end";
