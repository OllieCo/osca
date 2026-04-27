/**
 * metrics.ts — central OTel metric instrument registry
 *
 * All custom Prometheus/OTel instruments live here so every file imports from
 * one place rather than creating duplicate meters.
 *
 * When the OTel SDK is not registered (test env, local dev without GRAFANA_OTLP_ENDPOINT)
 * the @opentelemetry/api returns no-op instruments — all .add() / .record() calls
 * are safe no-ops with zero overhead.
 */

import { metrics } from "@opentelemetry/api"

const meter = metrics.getMeter("ospa-api", "1.0.0")

// ── Inference queue ───────────────────────────────────────────────────────────
// UpDownCounter is the correct instrument for a "current level" gauge that can
// both increase and decrease (e.g. jobs waiting in the queue).

/** Current number of inference jobs sitting in the BullMQ waiting state. */
export const inferenceQueueWaiting = meter.createUpDownCounter(
  "ospa_inference_queue_waiting",
  {
    description: "Number of inference jobs currently waiting in the BullMQ queue",
    unit: "jobs",
  }
)

/** Current number of inference jobs actively being processed by a worker. */
export const inferenceQueueActive = meter.createUpDownCounter(
  "ospa_inference_queue_active",
  {
    description: "Number of inference jobs currently being processed",
    unit: "jobs",
  }
)

/** Monotonically increasing count of successfully completed inference jobs. */
export const inferenceJobsCompleted = meter.createCounter(
  "ospa_inference_jobs_completed_total",
  {
    description: "Total inference jobs completed successfully",
  }
)

/**
 * Monotonically increasing count of inference jobs that exhausted all retries.
 * Only incremented on the final failure — not on intermediate retry attempts.
 */
export const inferenceJobsFailed = meter.createCounter(
  "ospa_inference_jobs_failed_total",
  {
    description: "Total inference jobs that failed after exhausting all retries",
  }
)

// ── Inference duration ────────────────────────────────────────────────────────
// Histogram with explicit bucket boundaries suited to Ollama inference latency.
// Boundaries in milliseconds.  Aligns with the p95 < 2 000ms SLO target.

/** Time-to-first-token (TTFT) for Ollama inference requests, in milliseconds. */
export const inferenceDuration = meter.createHistogram(
  "ospa_inference_duration_milliseconds",
  {
    description: "Ollama inference request duration (TTFT) in milliseconds",
    unit: "ms",
    advice: {
      explicitBucketBoundaries: [100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000],
    },
  }
)

// ── Agent actions ─────────────────────────────────────────────────────────────

/**
 * Counter incremented every time the action-planner returns an action.
 * Labelled by `action_type` (click, type, navigate, scrape, done, error, …).
 */
export const actionsTotal = meter.createCounter("ospa_actions_total", {
  description: "Total agent actions planned, by action type",
})

// ── Retention sweep ───────────────────────────────────────────────────────────

/** Counter incremented each time the retention sweep hard-deletes soft-deleted users. */
export const retentionUsersHardDeleted = meter.createCounter(
  "ospa_retention_users_hard_deleted_total",
  { description: "Users hard-deleted by the retention sweep after the 90-day grace period" }
)

/** Counter incremented each time the retention sweep hard-deletes soft-deleted schools. */
export const retentionSchoolsHardDeleted = meter.createCounter(
  "ospa_retention_schools_hard_deleted_total",
  { description: "Schools hard-deleted by the retention sweep after the 90-day grace period" }
)

/** Counter incremented each time the retention sweep purges aged-out audit logs. */
export const retentionAuditLogsPurged = meter.createCounter(
  "ospa_retention_audit_logs_purged_total",
  { description: "AuditLog rows deleted by the retention sweep after 7-year retention" }
)

/** Histogram of retention sweep wall-clock duration in milliseconds. */
export const retentionSweepDuration = meter.createHistogram(
  "ospa_retention_sweep_duration_milliseconds",
  {
    description: "Wall-clock time for a full retention sweep run, in milliseconds",
    unit: "ms",
    advice: { explicitBucketBoundaries: [50, 100, 250, 500, 1_000, 5_000, 15_000, 60_000] },
  }
)

// ── PII blocks ────────────────────────────────────────────────────────────────

/**
 * Counter incremented when the PiiSpanProcessor redacts at least one PII
 * attribute from a span before OTLP export.  Useful for auditing how much PII
 * is reaching the export boundary and being scrubbed.
 */
export const piiBlocksTotal = meter.createCounter("ospa_pii_blocks_total", {
  description: "Spans that had one or more PII attributes redacted before OTLP export",
})
