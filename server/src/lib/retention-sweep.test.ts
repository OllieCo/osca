/**
 * retention-sweep.test.ts
 *
 * Unit-tests the retention-sweep functions using a mocked Prisma client.
 * No live database required — all DB calls are stubbed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { SOFT_DELETE_GRACE_DAYS, AUDIT_LOG_MAX_AGE_DAYS, daysAgo } from "./retention-sweep"

// ── Mock the db module ────────────────────────────────────────────────────────
// vi.mock factories are hoisted before variable declarations, so use vi.hoisted()
// to declare the spy before the factory runs.

const { mockDeleteMany } = vi.hoisted(() => ({
  mockDeleteMany: vi.fn(),
}))

vi.mock("./db.js", () => ({
  db: {
    user: { deleteMany: mockDeleteMany },
    school: { deleteMany: mockDeleteMany },
    auditLog: { deleteMany: mockDeleteMany },
  },
}))

// ── Mock logger + metrics (silence output) ────────────────────────────────────

vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

vi.mock("./metrics.js", () => ({
  retentionUsersHardDeleted: { add: vi.fn() },
  retentionSchoolsHardDeleted: { add: vi.fn() },
  retentionAuditLogsPurged: { add: vi.fn() },
  retentionSweepDuration: { record: vi.fn() },
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockDeleteMany.mockResolvedValue({ count: 0 })
})

// ── daysAgo ───────────────────────────────────────────────────────────────────

describe("daysAgo", () => {
  it("returns a date approximately N days before now", () => {
    const before = Date.now()
    const result = daysAgo(10)
    const after = Date.now()
    const expectedMs = 10 * 24 * 60 * 60 * 1_000
    expect(result.getTime()).toBeGreaterThanOrEqual(before - expectedMs - 5)
    expect(result.getTime()).toBeLessThanOrEqual(after - expectedMs + 5)
  })

  it("returns a date in the past for any positive input", () => {
    expect(daysAgo(1).getTime()).toBeLessThan(Date.now())
    expect(daysAgo(365).getTime()).toBeLessThan(Date.now())
  })
})

// ── Constants ─────────────────────────────────────────────────────────────────

describe("retention constants", () => {
  it("SOFT_DELETE_GRACE_DAYS is 90", () => {
    expect(SOFT_DELETE_GRACE_DAYS).toBe(90)
  })

  it("AUDIT_LOG_MAX_AGE_DAYS is 7 years", () => {
    expect(AUDIT_LOG_MAX_AGE_DAYS).toBe(7 * 365)
  })
})

// ── sweepDeletedUsers ─────────────────────────────────────────────────────────

describe("sweepDeletedUsers", () => {
  it("calls db.user.deleteMany with correct where clause", async () => {
    const { sweepDeletedUsers } = await import("./retention-sweep")
    mockDeleteMany.mockResolvedValueOnce({ count: 3 })

    const count = await sweepDeletedUsers()
    expect(count).toBe(3)
    expect(mockDeleteMany).toHaveBeenCalledOnce()

    const call = mockDeleteMany.mock.calls[0]![0] as { where: { deletedAt: { not: null; lt: Date } } }
    expect(call.where.deletedAt.not).toBeNull()
    expect(call.where.deletedAt.lt).toBeInstanceOf(Date)

    // The cutoff should be ~90 days ago
    const cutoffMs = call.where.deletedAt.lt.getTime()
    const expectedMs = Date.now() - SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1_000
    expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(1_000)
  })

  it("returns 0 and does not log when nothing to delete", async () => {
    const { sweepDeletedUsers } = await import("./retention-sweep")
    mockDeleteMany.mockResolvedValueOnce({ count: 0 })
    const count = await sweepDeletedUsers()
    expect(count).toBe(0)
  })
})

// ── sweepDeletedSchools ───────────────────────────────────────────────────────

describe("sweepDeletedSchools", () => {
  it("calls db.school.deleteMany with correct where clause", async () => {
    const { sweepDeletedSchools } = await import("./retention-sweep")
    mockDeleteMany.mockResolvedValueOnce({ count: 1 })

    const count = await sweepDeletedSchools()
    expect(count).toBe(1)
    expect(mockDeleteMany).toHaveBeenCalledOnce()

    const call = mockDeleteMany.mock.calls[0]![0] as { where: { deletedAt: { not: null; lt: Date } } }
    expect(call.where.deletedAt.not).toBeNull()
    expect(call.where.deletedAt.lt).toBeInstanceOf(Date)
  })
})

// ── sweepAuditLogs ────────────────────────────────────────────────────────────

describe("sweepAuditLogs", () => {
  it("calls db.auditLog.deleteMany with cutoff ~7 years ago", async () => {
    const { sweepAuditLogs } = await import("./retention-sweep")
    mockDeleteMany.mockResolvedValueOnce({ count: 150 })

    const count = await sweepAuditLogs()
    expect(count).toBe(150)

    const call = mockDeleteMany.mock.calls[0]![0] as { where: { createdAt: { lt: Date } } }
    const cutoffMs = call.where.createdAt.lt.getTime()
    const expectedMs = Date.now() - AUDIT_LOG_MAX_AGE_DAYS * 24 * 60 * 60 * 1_000
    expect(Math.abs(cutoffMs - expectedMs)).toBeLessThan(1_000)
  })
})

// ── runRetentionSweep ─────────────────────────────────────────────────────────

describe("runRetentionSweep", () => {
  it("returns aggregated counts when all sweeps succeed", async () => {
    const { runRetentionSweep } = await import("./retention-sweep")
    mockDeleteMany
      .mockResolvedValueOnce({ count: 5 })   // users
      .mockResolvedValueOnce({ count: 1 })   // schools
      .mockResolvedValueOnce({ count: 200 }) // audit logs

    const result = await runRetentionSweep()
    expect(result.usersDeleted).toBe(5)
    expect(result.schoolsDeleted).toBe(1)
    expect(result.auditLogsPurged).toBe(200)
    expect(result.hadError).toBe(false)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it("sets hadError=true if a sweep throws, but still runs remaining sweeps", async () => {
    const { runRetentionSweep } = await import("./retention-sweep")
    mockDeleteMany
      .mockRejectedValueOnce(new Error("DB timeout"))  // users fails
      .mockResolvedValueOnce({ count: 2 })              // schools OK
      .mockResolvedValueOnce({ count: 10 })             // audit logs OK

    const result = await runRetentionSweep()
    expect(result.hadError).toBe(true)
    expect(result.schoolsDeleted).toBe(2)
    expect(result.auditLogsPurged).toBe(10)
  })
})
