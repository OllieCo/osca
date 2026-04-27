/**
 * emit.test.ts
 *
 * Tests for the typed telemetry emit helper.
 * Mocks the Prisma client — no live DB required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock db ────────────────────────────────────────────────────────────────────

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }))

vi.mock("../db.js", () => ({
  db: { telemetryEvent: { create: mockCreate } },
}))

vi.mock("../logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { emit, emitAsync } from "./emit.js"
import { logger } from "../logger.js"

// ── Helpers ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockCreate.mockResolvedValue({ id: "evt_1" })
})

// ── emit ───────────────────────────────────────────────────────────────────────

describe("emit", () => {
  it("writes a job_completed event to telemetry_events", async () => {
    await emit("job_completed", {
      job_id: "j1",
      school_id: "s1",
      duration_ms: 200,
      attempts: 1,
    })

    expect(mockCreate).toHaveBeenCalledOnce()
    const { data } = mockCreate.mock.calls[0]![0]
    expect(data.event).toBe("job_completed")
    expect(data.level).toBe("L3")
    expect(data.schoolId).toBe("s1")
    expect(data.props).toMatchObject({ duration_ms: 200, attempts: 1 })
    // school_id must NOT be duplicated in props (it's extracted to a column)
    expect(data.props).not.toHaveProperty("school_id")
  })

  it("writes an L0 event with null schoolId and userId", async () => {
    await emit("job_enqueued", { job_id: "j2" })

    const { data } = mockCreate.mock.calls[0]![0]
    expect(data.event).toBe("job_enqueued")
    expect(data.level).toBe("L2")
    expect(data.schoolId).toBeNull()
    expect(data.userId).toBeNull()
  })

  it("strips PII-shaped field names and warns in non-production", async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "development"

    // Casting to bypass TypeScript — simulating a runtime prop injection
    await emit("job_failed", {
      job_id: "j3",
      error_code: "Timeout",
      attempts: 3,
      // @ts-expect-error — deliberate PII injection test
      email: "teacher@eq.edu.au",
      token: "super-secret",
    })

    const { data } = mockCreate.mock.calls[0]![0]
    expect(data.props).not.toHaveProperty("email")
    expect(data.props).not.toHaveProperty("token")
    expect(data.props).toHaveProperty("error_code", "Timeout")
    expect(vi.mocked(logger.warn)).toHaveBeenCalled()

    process.env.NODE_ENV = originalEnv
  })

  it("swallows DB errors silently", async () => {
    mockCreate.mockRejectedValueOnce(new Error("Connection lost"))
    // Should not throw
    await expect(
      emit("job_enqueued", { job_id: "j4" })
    ).resolves.toBeUndefined()
  })

  it("does not warn on PII field names in production", async () => {
    const originalEnv = process.env.NODE_ENV
    process.env.NODE_ENV = "production"

    await emit("job_failed", {
      job_id: "j5",
      error_code: "Timeout",
      attempts: 1,
      // @ts-expect-error — deliberate PII injection test
      email: "teacher@eq.edu.au",
    })

    expect(vi.mocked(logger.warn)).not.toHaveBeenCalled()
    process.env.NODE_ENV = originalEnv
  })
})

// ── emitAsync ──────────────────────────────────────────────────────────────────

describe("emitAsync", () => {
  it("fires without blocking (returns void synchronously)", () => {
    const result = emitAsync("job_enqueued", { job_id: "j6" })
    expect(result).toBeUndefined()
  })
})
