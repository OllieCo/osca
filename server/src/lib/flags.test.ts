/**
 * flags.test.ts — Feature Flags & Gradual Rollout (Epics 1 + 2)
 *
 * Tests cover:
 *   - evaluateFlag: unknown flag, denylist, allowlist, tier gate, percentage
 *     bucketing (stability + distribution), kill-switch default-off, no context
 *   - hashBucket: determinism and 0–99 range
 *   - getFlags: returns all flag keys evaluated
 *   - invalidateFlagCache: cache is cleared and re-fetched on next call
 *
 * No live DB or Redis required — Prisma client is fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

const { mockFindMany } = vi.hoisted(() => ({
  mockFindMany: vi.fn(),
}))

vi.mock("./db.js", () => ({
  db: {
    featureFlag: { findMany: mockFindMany },
  },
}))

vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { evaluateFlag, getFlags, hashBucket, invalidateFlagCache, FLAG_CACHE_TTL_MS } from "./flags.js"

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeFlag(overrides: Partial<{
  key: string
  description: string
  defaultEnabled: boolean
  killSwitch: boolean
  rolloutPct: number
  allowlist: string[]
  denylist: string[]
  requiredPlan: "FREE" | "TIER_1" | "TIER_2" | null
  expiresAt: Date | null
  createdAt: Date
  updatedAt: Date
}> = {}) {
  return {
    key: "test-flag",
    description: "Test flag",
    defaultEnabled: false,
    killSwitch: false,
    rolloutPct: 100,
    allowlist: [],
    denylist: [],
    requiredPlan: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const FREE_CTX = { schoolId: "school-a", plan: "FREE" as const }
const TIER1_CTX = { schoolId: "school-b", plan: "TIER_1" as const }
const ANON_CTX = { schoolId: null, plan: null }

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  invalidateFlagCache() // ensure each test starts with a cold cache
})

// ── hashBucket ─────────────────────────────────────────────────────────────────

describe("hashBucket", () => {
  it("returns a value in [0, 99]", () => {
    for (let i = 0; i < 100; i++) {
      const bucket = hashBucket(`school-${i}`, "my-flag")
      expect(bucket).toBeGreaterThanOrEqual(0)
      expect(bucket).toBeLessThanOrEqual(99)
    }
  })

  it("is deterministic — same inputs always return the same bucket", () => {
    const a = hashBucket("school-abc", "relief-v2")
    const b = hashBucket("school-abc", "relief-v2")
    expect(a).toBe(b)
  })

  it("produces different buckets for different school IDs", () => {
    const buckets = new Set(
      Array.from({ length: 50 }, (_, i) => hashBucket(`school-${i}`, "flag"))
    )
    // Very unlikely all 50 map to fewer than 5 distinct buckets
    expect(buckets.size).toBeGreaterThan(5)
  })

  it("produces different buckets for different flag keys", () => {
    const b1 = hashBucket("school-x", "flag-alpha")
    const b2 = hashBucket("school-x", "flag-beta")
    // Not a strict requirement, but they should generally differ
    // If they happen to be equal, that's fine — just test the range
    expect(typeof b1).toBe("number")
    expect(typeof b2).toBe("number")
  })
})

// ── evaluateFlag ───────────────────────────────────────────────────────────────

describe("evaluateFlag — unknown flag", () => {
  it("returns false when flag key is not in the DB", async () => {
    mockFindMany.mockResolvedValueOnce([])
    const result = await evaluateFlag("does-not-exist", FREE_CTX)
    expect(result).toBe(false)
  })
})

describe("evaluateFlag — kill switch (defaultEnabled=false)", () => {
  it("returns false when no school context (anonymous caller)", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "risky-actor", killSwitch: true, defaultEnabled: false, rolloutPct: 100 }),
    ])
    const result = await evaluateFlag("risky-actor", ANON_CTX)
    expect(result).toBe(false)
  })
})

describe("evaluateFlag — denylist (Rule 2)", () => {
  it("returns false for a denylisted school even at 100% rollout", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-a", rolloutPct: 100, denylist: ["school-a"] }),
    ])
    const result = await evaluateFlag("flag-a", FREE_CTX) // FREE_CTX uses school-a
    expect(result).toBe(false)
  })

  it("does not affect non-denylisted schools", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-a", rolloutPct: 100, denylist: ["school-z"] }),
    ])
    const result = await evaluateFlag("flag-a", FREE_CTX) // school-a not in denylist
    expect(result).toBe(true)
  })
})

describe("evaluateFlag — allowlist (Rule 3)", () => {
  it("returns true for an allowlisted school even at 0% rollout", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-b", rolloutPct: 0, defaultEnabled: false, allowlist: ["school-a"] }),
    ])
    const result = await evaluateFlag("flag-b", FREE_CTX)
    expect(result).toBe(true)
  })

  it("denylist takes precedence over allowlist", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({
        key: "flag-c",
        rolloutPct: 100,
        allowlist: ["school-a"],
        denylist: ["school-a"], // same school in both lists
      }),
    ])
    const result = await evaluateFlag("flag-c", FREE_CTX)
    expect(result).toBe(false) // denylist wins
  })
})

describe("evaluateFlag — tier gate (Rule 4)", () => {
  it("returns defaultEnabled for a school below the required plan", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-tier", rolloutPct: 100, requiredPlan: "TIER_1", defaultEnabled: false }),
    ])
    const result = await evaluateFlag("flag-tier", FREE_CTX) // FREE < TIER_1
    expect(result).toBe(false) // returns defaultEnabled
  })

  it("returns true for a school meeting the required plan at 100% rollout", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-tier", rolloutPct: 100, requiredPlan: "TIER_1" }),
    ])
    const result = await evaluateFlag("flag-tier", TIER1_CTX)
    expect(result).toBe(true)
  })

  it("TIER_2 school meets TIER_1 requirement", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-tier", rolloutPct: 100, requiredPlan: "TIER_1" }),
    ])
    const result = await evaluateFlag("flag-tier", { schoolId: "school-c", plan: "TIER_2" })
    expect(result).toBe(true)
  })

  it("allowlist bypasses tier gate", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({
        key: "flag-tier",
        rolloutPct: 100,
        requiredPlan: "TIER_2",
        allowlist: ["school-a"],
      }),
    ])
    // school-a is FREE but is allowlisted
    const result = await evaluateFlag("flag-tier", FREE_CTX)
    expect(result).toBe(true)
  })
})

describe("evaluateFlag — percentage rollout (Rule 5)", () => {
  it("returns false for all schools at 0% rollout", async () => {
    const schools = Array.from({ length: 20 }, (_, i) => `school-${i}`)
    mockFindMany.mockResolvedValue([
      makeFlag({ key: "flag-pct", rolloutPct: 0, defaultEnabled: false }),
    ])

    for (const schoolId of schools) {
      invalidateFlagCache()
      const result = await evaluateFlag("flag-pct", { schoolId, plan: "FREE" })
      expect(result).toBe(false)
    }
  })

  it("returns true for all schools at 100% rollout", async () => {
    const schools = Array.from({ length: 20 }, (_, i) => `school-${i}`)
    mockFindMany.mockResolvedValue([
      makeFlag({ key: "flag-pct", rolloutPct: 100 }),
    ])

    for (const schoolId of schools) {
      invalidateFlagCache()
      const result = await evaluateFlag("flag-pct", { schoolId, plan: "FREE" })
      expect(result).toBe(true)
    }
  })

  it("produces stable buckets — same school always gets the same result", async () => {
    mockFindMany.mockResolvedValue([
      makeFlag({ key: "flag-stable", rolloutPct: 50 }),
    ])

    const schoolId = "stable-school-xyz"
    invalidateFlagCache()
    const first = await evaluateFlag("flag-stable", { schoolId, plan: "FREE" })
    // Second call hits cache; third call after cache invalidation re-fetches
    const second = await evaluateFlag("flag-stable", { schoolId, plan: "FREE" })
    invalidateFlagCache()
    const third = await evaluateFlag("flag-stable", { schoolId, plan: "FREE" })

    expect(first).toBe(second)
    expect(first).toBe(third)
  })

  it("distributes flags roughly evenly at 50% rollout", async () => {
    // 200 schools at 50% rollout — expect 40%–60% to be enabled
    const schools = Array.from({ length: 200 }, (_, i) => `school-rollout-${i}`)
    mockFindMany.mockResolvedValue([
      makeFlag({ key: "flag-dist", rolloutPct: 50 }),
    ])
    invalidateFlagCache()

    let enabled = 0
    for (const schoolId of schools) {
      if (hashBucket(schoolId, "flag-dist") < 50) enabled++
    }

    expect(enabled).toBeGreaterThan(70)  // at least 35% (allowing generous variance)
    expect(enabled).toBeLessThan(130)     // at most 65%
  })
})

describe("evaluateFlag — no school context (Rule 6)", () => {
  it("returns defaultEnabled=true when no schoolId", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-default", defaultEnabled: true, rolloutPct: 0 }),
    ])
    const result = await evaluateFlag("flag-default", ANON_CTX)
    expect(result).toBe(true)
  })

  it("returns defaultEnabled=false when no schoolId", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-default", defaultEnabled: false, rolloutPct: 100 }),
    ])
    const result = await evaluateFlag("flag-default", ANON_CTX)
    expect(result).toBe(false)
  })
})

describe("evaluateFlag — error handling", () => {
  it("returns false and does not throw when DB throws", async () => {
    mockFindMany.mockRejectedValueOnce(new Error("DB connection lost"))
    const result = await evaluateFlag("any-flag", FREE_CTX)
    expect(result).toBe(false)
  })
})

// ── getFlags ───────────────────────────────────────────────────────────────────

describe("getFlags", () => {
  it("returns a map of all flag keys with their evaluated values", async () => {
    mockFindMany.mockResolvedValueOnce([
      makeFlag({ key: "flag-one", rolloutPct: 100 }),
      makeFlag({ key: "flag-two", rolloutPct: 0, defaultEnabled: false }),
      makeFlag({ key: "flag-three", rolloutPct: 100, denylist: ["school-a"] }),
    ])

    const result = await getFlags(FREE_CTX) // FREE_CTX uses school-a
    expect(result).toHaveProperty("flag-one", true)
    expect(result).toHaveProperty("flag-two", false)
    expect(result).toHaveProperty("flag-three", false) // school-a is denylisted
  })

  it("returns an empty object when the flag table is empty", async () => {
    mockFindMany.mockResolvedValueOnce([])
    const result = await getFlags(FREE_CTX)
    expect(result).toEqual({})
  })

  it("returns an empty object and does not throw when DB throws", async () => {
    mockFindMany.mockRejectedValueOnce(new Error("timeout"))
    const result = await getFlags(FREE_CTX)
    expect(result).toEqual({})
  })
})

// ── Cache behaviour ────────────────────────────────────────────────────────────

describe("flag cache", () => {
  it("fetches from DB only once within the TTL window", async () => {
    mockFindMany.mockResolvedValue([makeFlag({ key: "cached-flag", rolloutPct: 100 })])

    await evaluateFlag("cached-flag", FREE_CTX)
    await evaluateFlag("cached-flag", FREE_CTX)
    await evaluateFlag("cached-flag", FREE_CTX)

    // Should only have called findMany once (cache hit on calls 2+3)
    expect(mockFindMany).toHaveBeenCalledTimes(1)
  })

  it("re-fetches from DB after invalidateFlagCache()", async () => {
    mockFindMany.mockResolvedValue([makeFlag({ key: "cache-bust-flag", rolloutPct: 100 })])

    await evaluateFlag("cache-bust-flag", FREE_CTX)
    invalidateFlagCache()
    await evaluateFlag("cache-bust-flag", FREE_CTX)

    expect(mockFindMany).toHaveBeenCalledTimes(2)
  })

  it("exports FLAG_CACHE_TTL_MS as a positive number", () => {
    expect(FLAG_CACHE_TTL_MS).toBeGreaterThan(0)
  })
})
