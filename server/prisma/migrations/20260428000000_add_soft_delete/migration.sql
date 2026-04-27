-- Migration: add_soft_delete
-- Adds deleted_at (soft-delete timestamp) to users and schools.
-- The retention-sweep cron job hard-deletes rows where deleted_at < NOW() - 90 days.
--
-- Apply: psql "$DATABASE_URL" -f this_file.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Index to speed up the daily retention-sweep query (only non-NULL deleted rows)
CREATE INDEX CONCURRENTLY IF NOT EXISTS users_deleted_at_idx
  ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS schools_deleted_at_idx
  ON schools (deleted_at)
  WHERE deleted_at IS NOT NULL;
