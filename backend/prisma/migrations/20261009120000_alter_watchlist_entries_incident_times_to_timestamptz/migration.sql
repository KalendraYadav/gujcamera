-- Phase 3.3: Convert incident_start and incident_end to TIMESTAMPTZ(3)
-- Preserves existing timestamp values by explicitly defining UTC interpretation.

ALTER TABLE "watchlist_entries"
  ALTER COLUMN "incident_start"
    TYPE TIMESTAMPTZ(3)
    USING "incident_start" AT TIME ZONE 'UTC',
  ALTER COLUMN "incident_end"
    TYPE TIMESTAMPTZ(3)
    USING "incident_end" AT TIME ZONE 'UTC';
