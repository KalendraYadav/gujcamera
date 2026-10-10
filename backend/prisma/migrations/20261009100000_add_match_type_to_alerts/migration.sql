-- Phase 2: Add match_type to alerts table (optional forward schema enhancement)
-- Explicitly distinguishes live monitoring matches from historical backfill matches.
-- Defaults to 'LIVE' for complete backward compatibility with all existing records.
--
-- Deployment Considerations:
-- 1. Non-blocking column addition with default. No table lock or downtime required.
-- 2. Fully compatible with existing Prisma models and queries.
--
-- Forward Migration:
ALTER TABLE "alerts"
  ADD COLUMN IF NOT EXISTS "match_type" TEXT NOT NULL DEFAULT 'LIVE';

-- Rollback SQL:
-- ALTER TABLE "alerts" DROP COLUMN IF EXISTS "match_type";
