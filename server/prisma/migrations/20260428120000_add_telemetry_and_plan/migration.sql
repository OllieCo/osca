-- Migration: add subscription plan + telemetry_events table
-- Story: Product Analytics & Telemetry — Epic 1 / 3

-- ── Subscription plan enum ─────────────────────────────────────────────────────

CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'TIER_1', 'TIER_2');

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan "SubscriptionPlan" NOT NULL DEFAULT 'FREE';

-- ── Telemetry level enum ───────────────────────────────────────────────────────

CREATE TYPE "TelemetryLevel" AS ENUM ('L0', 'L1', 'L2', 'L3');

-- ── telemetry_events table ─────────────────────────────────────────────────────
-- Separate from audit_logs:
--   • Different retention (90d hot / 12m cold vs 7y for audit)
--   • Different access controls (product-analytics read-only role)
--   • No foreign keys — we don't want telemetry writes to fail due to
--     cascaded deletes on schools/users (rows may outlive the record)

CREATE TABLE IF NOT EXISTS telemetry_events (
  id          TEXT        PRIMARY KEY,
  event       TEXT        NOT NULL,
  level       "TelemetryLevel" NOT NULL,
  school_id   TEXT,           -- NULL for L0 events
  user_id     TEXT,           -- anonymised user ID; NULL unless L2
  props       JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial indexes tuned for the most common queries:
--   • "all events of type X in the last N days" (product dashboard)
--   • "all events for school Y in this month" (freemium enforcement)
CREATE INDEX CONCURRENTLY IF NOT EXISTS telemetry_event_name_time_idx
  ON telemetry_events (event, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS telemetry_school_time_idx
  ON telemetry_events (school_id, created_at DESC)
  WHERE school_id IS NOT NULL;

-- ── Row-level retention housekeeping note ─────────────────────────────────────
-- L0/L1 rows: retain 13 months (deleted by retention-sweep extension, future story)
-- L2/L3 rows: 90 days hot; after 90d moved to cold aggregates (future story)
-- For now, retention-sweep does not yet touch telemetry_events — tracked as TODO
-- in the retention-sweep close-out.
