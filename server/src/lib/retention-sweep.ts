/**
 * retention-sweep.ts — Scheduled data-retention purge jobs.
 *
 * Retention schedule (see docs/data-retention-policy.md):
 *   - Users / Schools:  active + 90 days after soft-delete → hard-delete
 *   - AuditLogs:        7 years (2 555 days) → purge
 *   - Session tokens:   24 h TTL enforced by Redis at creation — no sweep needed
 *
 * Sweep cadence: daily at 03:00 UTC (off-peak AEST — 13:00/11:00 local).
 *
 * Individual sweep functions are exported for unit testing.
 * scheduleRetentionSweeps() is the runtime entry-point — call once in index.ts.
 */

import { db } from "./db.js"
import { logger } from "./logger.js"
import {
  retentionUsersHardDeleted,
  retentionSchoolsHardDeleted,
  retentionAuditLogsPurged,
  retentionSweepDuration,
} from "./metrics.js"

// ── Constants ─────────────────────────────────────────────────────────────────

/** Days after soft-delete before a record is hard-deleted. */
export const SOFT_DELETE_GRACE_DAYS = 90

/** Maximum age of AuditLog records (7 years in days). */
export const AUDIT_LOG_MAX_AGE_DAYS = 7 * 365

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a Date that is `days` calendar days before now (UTC). */
export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000)
}

// ── Sweep functions ───────────────────────────────────────────────────────────

/**
 * Hard-deletes User records soft-deleted more than SOFT_DELETE_GRACE_DAYS ago.
 * Returns the number of rows deleted.
 */
export async function sweepDeletedUsers(): Promise<number> {
  const cutoff = daysAgo(SOFT_DELETE_GRACE_DAYS)
  const result = await db.user.deleteMany({
    where: { deletedAt: { not: null, lt: cutoff } },
  })
  if (result.count > 0) {
    logger.info({ count: result.count, cutoff }, "retention: hard-deleted users")
    retentionUsersHardDeleted.add(result.count)
  }
  return result.count
}

/**
 * Hard-deletes School records soft-deleted more than SOFT_DELETE_GRACE_DAYS ago.
 * A school should only be soft-deleted once all its users are already soft-deleted.
 * Returns the number of rows deleted.
 */
export async function sweepDeletedSchools(): Promise<number> {
  const cutoff = daysAgo(SOFT_DELETE_GRACE_DAYS)
  const result = await db.school.deleteMany({
    where: { deletedAt: { not: null, lt: cutoff } },
  })
  if (result.count > 0) {
    logger.info({ count: result.count, cutoff }, "retention: hard-deleted schools")
    retentionSchoolsHardDeleted.add(result.count)
  }
  return result.count
}

/**
 * Purges AuditLog records older than AUDIT_LOG_MAX_AGE_DAYS (7 years).
 * 7-year retention satisfies Australian tax-record obligations.
 * Returns the number of rows deleted.
 */
export async function sweepAuditLogs(): Promise<number> {
  const cutoff = daysAgo(AUDIT_LOG_MAX_AGE_DAYS)
  const result = await db.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })
  if (result.count > 0) {
    logger.info({ count: result.count, cutoff }, "retention: purged audit logs")
    retentionAuditLogsPurged.add(result.count)
  }
  return result.count
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export type SweepResult = {
  usersDeleted: number
  schoolsDeleted: number
  auditLogsPurged: number
  durationMs: number
  hadError: boolean
}

/**
 * Runs all retention sweeps in sequence.
 * Errors in individual sweeps are caught and logged — a sweep failure must not
 * crash the server process.
 */
export async function runRetentionSweep(): Promise<SweepResult> {
  logger.info("retention: sweep starting")
  const t0 = Date.now()

  let usersDeleted = 0
  let schoolsDeleted = 0
  let auditLogsPurged = 0
  let hadError = false

  const sweeps: Array<[string, () => Promise<number>]> = [
    ["sweepDeletedUsers", sweepDeletedUsers],
    ["sweepDeletedSchools", sweepDeletedSchools],
    ["sweepAuditLogs", sweepAuditLogs],
  ]

  for (const [name, fn] of sweeps) {
    try {
      const count = await fn()
      if (name === "sweepDeletedUsers") usersDeleted = count
      if (name === "sweepDeletedSchools") schoolsDeleted = count
      if (name === "sweepAuditLogs") auditLogsPurged = count
    } catch (err) {
      logger.error({ sweep: name, err }, "retention: sweep failed")
      hadError = true
    }
  }

  const durationMs = Date.now() - t0
  retentionSweepDuration.record(durationMs)
  logger.info({ durationMs, hadError, usersDeleted, schoolsDeleted, auditLogsPurged },
    "retention: sweep finished")

  return { usersDeleted, schoolsDeleted, auditLogsPurged, durationMs, hadError }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

/**
 * Schedules the daily retention sweep to run at 03:00 UTC.
 * Returns a cleanup function — call it on graceful shutdown.
 *
 * Call once from index.ts after the DB connection is established.
 */
export function scheduleRetentionSweeps(): () => void {
  const MS_PER_DAY = 24 * 60 * 60 * 1_000

  // Calculate time until the next 03:00 UTC
  const now = new Date()
  const next0300Utc = new Date(now)
  next0300Utc.setUTCHours(3, 0, 0, 0)
  if (next0300Utc <= now) {
    next0300Utc.setUTCDate(next0300Utc.getUTCDate() + 1)
  }
  const delayMs = next0300Utc.getTime() - now.getTime()

  logger.info({ nextRunAt: next0300Utc.toISOString(), delayMs },
    "retention: sweep scheduled")

  let intervalHandle: ReturnType<typeof setInterval> | undefined
  const timeoutHandle = setTimeout(() => {
    void runRetentionSweep()
    intervalHandle = setInterval(() => void runRetentionSweep(), MS_PER_DAY)
  }, delayMs)

  return () => {
    clearTimeout(timeoutHandle)
    if (intervalHandle !== undefined) clearInterval(intervalHandle)
    logger.info("retention: sweep scheduler stopped")
  }
}
