/**
 * freemium.test.ts
 *
 * Tests for freemiumGuard middleware and helpers.
 * Mocks Prisma client and telemetry emit — no live DB or Redis required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import express, { type Request, type Response } from "express"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockTelemetryCount, mockSubscriptionFindFirst, mockTelemetryCreate } = vi.hoisted(() => ({
  mockTelemetryCount: vi.fn(),
  mockSubscriptionFindFirst: vi.fn(),
  mockTelemetryCreate: vi.fn(),
}))

vi.mock("./db.js", () => ({
  db: {
    telemetryEvent: {
      count: mockTelemetryCount,
      create: mockTelemetryCreate,
    },
    subscription: { findFirst: mockSubscriptionFindFirst },
  },
}))

vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// emit is fire-and-forget; stub it out so tests don't await nothing
vi.mock("./telemetry/emit.js", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  emitAsync: vi.fn(),
}))

import { freemiumGuard, getSchoolId, countMonthlyActions, getSchoolPlan, FREEMIUM_ACTION_CAP } from "./freemium.js"

// ── Test app helper ───────────────────────────────────────────────────────────

function makeApp() {
  const app = express()
  app.use(express.json())
  app.post("/api/agent/action-result", freemiumGuard, (_req: Request, res: Response) => {
    res.json({ ok: true })
  })
  return app
}

async function postAction(app: express.Express, schoolId?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (schoolId) headers["x-school-id"] = schoolId

  const res = await fetch("http://localhost:9996/api/agent/action-result", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  })
  return { status: res.status, body: await res.json() }
}

// ── getSchoolId ────────────────────────────────────────────────────────────────

describe("getSchoolId", () => {
  it("returns header value when present", () => {
    const req = { headers: { "x-school-id": "s1" } } as unknown as Request
    expect(getSchoolId(req)).toBe("s1")
  })

  it("returns null when header is absent", () => {
    const req = { headers: {} } as unknown as Request
    expect(getSchoolId(req)).toBeNull()
  })
})

// ── getSchoolPlan ─────────────────────────────────────────────────────────────

describe("getSchoolPlan", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns FREE when no active subscription exists", async () => {
    mockSubscriptionFindFirst.mockResolvedValueOnce(null)
    expect(await getSchoolPlan("s1")).toBe("FREE")
  })

  it("returns the plan from an active subscription", async () => {
    mockSubscriptionFindFirst.mockResolvedValueOnce({ plan: "TIER_1" })
    expect(await getSchoolPlan("s1")).toBe("TIER_1")
  })

  it("returns TIER_2 for a TRIALING school on TIER_2", async () => {
    mockSubscriptionFindFirst.mockResolvedValueOnce({ plan: "TIER_2" })
    expect(await getSchoolPlan("s2")).toBe("TIER_2")
  })
})

// ── countMonthlyActions ───────────────────────────────────────────────────────

describe("countMonthlyActions", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns the telemetry count from DB", async () => {
    mockTelemetryCount.mockResolvedValueOnce(42)
    const count = await countMonthlyActions("s1")
    expect(count).toBe(42)

    // Verify the query targets the right event + school
    const args = mockTelemetryCount.mock.calls[0]![0]
    expect(args.where.schoolId).toBe("s1")
    expect(args.where.event).toBe("action_executed")
    expect(args.where.createdAt.gte).toBeInstanceOf(Date)
  })
})

// ── freemiumGuard integration ─────────────────────────────────────────────────

describe("freemiumGuard", () => {
  let server: ReturnType<express.Express["listen"]>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockTelemetryCreate.mockResolvedValue({ id: "e1" })
    const app = makeApp()
    await new Promise<void>((resolve) => {
      server = app.listen(9996, () => resolve())
    })
  })

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it("passes through when no school ID header is present", async () => {
    const { status, body } = await postAction(makeApp())
    // No header → no lookup → allow
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it("passes through for a TIER_1 school regardless of action count", async () => {
    mockSubscriptionFindFirst.mockResolvedValue({ plan: "TIER_1" })
    // count should never be called for paid schools
    const { status } = await postAction(makeApp(), "paid-school")
    expect(status).toBe(200)
    expect(mockTelemetryCount).not.toHaveBeenCalled()
  })

  it("passes through for a FREE school under the cap", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null) // FREE
    mockTelemetryCount.mockResolvedValue(50)
    const { status } = await postAction(makeApp(), "free-school")
    expect(status).toBe(200)
  })

  it("returns 402 for a FREE school at the cap", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null) // FREE
    mockTelemetryCount.mockResolvedValue(FREEMIUM_ACTION_CAP) // exactly at cap
    const { status, body } = await postAction(makeApp(), "free-school")
    expect(status).toBe(402)
    expect(body.error).toBe("freemium_limit_reached")
    expect(body.cap).toBe(FREEMIUM_ACTION_CAP)
    expect(body.actions_this_month).toBe(FREEMIUM_ACTION_CAP)
    expect(body.upgrade_url).toContain("pricing")
  })

  it("returns 402 for a FREE school over the cap", async () => {
    mockSubscriptionFindFirst.mockResolvedValue(null)
    mockTelemetryCount.mockResolvedValue(FREEMIUM_ACTION_CAP + 5)
    const { status } = await postAction(makeApp(), "free-school")
    expect(status).toBe(402)
  })

  it("passes through if DB throws (fail-open, never block the user)", async () => {
    mockSubscriptionFindFirst.mockRejectedValue(new Error("DB timeout"))
    const { status } = await postAction(makeApp(), "school-with-db-error")
    expect(status).toBe(200)
  })
})
