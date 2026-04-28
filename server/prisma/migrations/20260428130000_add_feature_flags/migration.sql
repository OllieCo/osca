-- Migration: add feature_flags table
-- Epic 1.1 — Flag evaluation core (Feature Flags & Gradual Rollout project)
--
-- Design notes:
--   • key is the PK — string, kebab-case, immutable.
--   • allowlist / denylist are TEXT[] — small arrays, no FK needed.
--   • rollout_pct is 0–100, enforced by CHECK constraint.
--   • required_plan references the SubscriptionPlan enum already in the DB.
--   • No FK to schools — flags are global config, not per-school rows.
--   • CONCURRENTLY indexes so this can run against a live DB without locking.

CREATE TABLE IF NOT EXISTS feature_flags (
  key              TEXT         NOT NULL,
  description      TEXT         NOT NULL DEFAULT '',
  default_enabled  BOOLEAN      NOT NULL DEFAULT FALSE,
  kill_switch      BOOLEAN      NOT NULL DEFAULT FALSE,
  rollout_pct      INTEGER      NOT NULL DEFAULT 0,
  allowlist        TEXT[]       NOT NULL DEFAULT '{}',
  denylist         TEXT[]       NOT NULL DEFAULT '{}',
  required_plan    "SubscriptionPlan",      -- NULL = no tier gate
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT feature_flags_pkey PRIMARY KEY (key),
  CONSTRAINT feature_flags_rollout_pct_range CHECK (rollout_pct >= 0 AND rollout_pct <= 100)
);

-- Partial index: quickly find stale flags for the hygiene report (Epic 3.2)
CREATE INDEX CONCURRENTLY IF NOT EXISTS feature_flags_stale_idx
  ON feature_flags (expires_at)
  WHERE expires_at IS NOT NULL;
