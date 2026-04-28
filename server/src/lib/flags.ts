/**
 * flags.ts — Feature Flags & Gradual Rollout (Epics 1 + 2)
 *
 * A thin, owned feature-flag layer. No external vendor required at our scale.
 *
 * Evaluation order (highest to lowest priority):
 *   1. Flag unknown → false
 *   2. schoolId in denylist → false  (stability-hold, overrides everything)
 *   3. schoolId in allowlist → true  (pilot/internal override, overrides rollout %)
 *   4. requiredPlan gate: school plan < required → defaultEnabled
 *   5. Percentage rollout: hash-based stable bucketing (FNV-1a on "schoolId:key")
 *   6. No schoolId context → defaultEnabled
 *
 * Cache: the full flag table is small (<100 rows) — loaded once and held in-memory
 * for FLAG_CACHE_TTL_MS. The server can be restarted to bust the cache instantly.
 * An Admin Console write should POST to /api/flags/refresh to invalidate early.
 *
 * School identity:
 *   Callers pass { schoolId, plan } — sourced from the x-school-id header until
 *   Auth Unification lands and populates req.auth. Nothing in this module reads
 *   from Express directly; keep it pure and testable.
 */

import { db } from "./db.js"
import { logger } from "./logger.js"

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FlagContext {
  /** The school's internal ID (cuid). Null for anonymous/unauthenticated callers. */
  schoolId: string | null
  /** The school's current subscription plan. Null means unknown — treated as FREE. */
  plan: "FREE" | "TIER_1" | "TIER_2" | null
}

/** Shape returned by the database (matches the Prisma FeatureFlag model). */
interface FlagRow {
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
}

// ── Cache ──────────────────────────────────────────────────────────────────────

/** How long to hold the full flag table in memory before re-fetching. */
export const FLAG_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface FlagCache {
  flags: Map<string, FlagRow>
  expiresAt: number // epoch ms
}

let _cache: FlagCache | null = null

/** Load all flags from Postgres (or return the in-memory cache if still warm). */
async function loadFlags(): Promise<Map<string, FlagRow>> {
  const now = Date.now()
  if (_cache && now < _cache.expiresAt) {
    return _cache.flags
  }

  const rows = await db.featureFlag.findMany()
  const map = new Map<string, FlagRow>()
  for (const row of rows) {
    map.set(row.key, row as FlagRow)
  }

  _cache = { flags: map, expiresAt: now + FLAG_CACHE_TTL_MS }
  logger.debug({ count: map.size }, "flags: cache refreshed")
  return map
}

/**
 * Invalidate the in-memory flag cache immediately.
 * Call this from a cache-bust endpoint after an Admin Console write.
 */
export function invalidateFlagCache(): void {
  _cache = null
  logger.info("flags: cache invalidated")
}

// ── Hash bucketing (Epic 2.1) ──────────────────────────────────────────────────

/**
 * FNV-1a 32-bit hash on the string "${schoolId}:${key}".
 * Returns a stable integer in [0, 99] used for percentage rollout.
 *
 * Properties:
 *   - Deterministic: same inputs always map to the same bucket.
 *   - Uniform: well-distributed across the 0–99 range.
 *   - Fast: O(n) on string length, no external dependency.
 */
export function hashBucket(schoolId: string, key: string): number {
  const str = `${schoolId}:${key}`
  let hash = 2166136261 // FNV-1a 32-bit offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    // Multiply by FNV prime (16777619) and keep in 32-bit unsigned range
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash % 100
}

// ── Plan ordering (for tier gate) ─────────────────────────────────────────────

const PLAN_RANK: Record<"FREE" | "TIER_1" | "TIER_2", number> = {
  FREE: 0,
  TIER_1: 1,
  TIER_2: 2,
}

function planMeetsRequirement(
  actual: "FREE" | "TIER_1" | "TIER_2" | null,
  required: "FREE" | "TIER_1" | "TIER_2" | null
): boolean {
  if (required === null) return true // no tier gate
  const actualRank = PLAN_RANK[actual ?? "FREE"]
  const requiredRank = PLAN_RANK[required]
  return actualRank >= requiredRank
}

// ── Core evaluation ────────────────────────────────────────────────────────────

/**
 * Evaluate a single feature flag for a given school context.
 *
 * Returns false for unknown flags (safe default).
 * Never throws — errors are logged and false is returned.
 *
 * @param key     Flag identifier, e.g. "relief-workflow-v2"
 * @param context School context: schoolId + plan
 */
export async function evaluateFlag(key: string, context: FlagContext): Promise<boolean> {
  try {
    const flags = await loadFlags()
    const flag = flags.get(key)

    // Unknown flag → off (safe default)
    if (!flag) {
      logger.debug({ key }, "flags: unknown flag evaluated — returning false")
      return false
    }

    const { schoolId, plan } = context

    // Rule 2: denylist wins over everything
    if (schoolId && flag.denylist.includes(schoolId)) {
      return false
    }

    // Rule 3: allowlist wins over rollout percentage (but NOT denylist)
    if (schoolId && flag.allowlist.includes(schoolId)) {
      return true
    }

    // Rule 4: tier gate — schools below the required plan see defaultEnabled
    if (!planMeetsRequirement(plan, flag.requiredPlan)) {
      return flag.defaultEnabled
    }

    // Rule 5: percentage rollout (only when we have a school identity)
    if (schoolId !== null) {
      if (flag.rolloutPct === 0) return flag.defaultEnabled
      if (flag.rolloutPct === 100) return true
      return hashBucket(schoolId, key) < flag.rolloutPct
    }

    // Rule 6: no school context → use configured default
    return flag.defaultEnabled
  } catch (err) {
    logger.error({ err, key }, "flags: evaluation error — returning false")
    return false
  }
}

/**
 * Evaluate all flags in the table for a given context.
 * Used by GET /api/flags — returns the complete flag map that the extension can cache.
 *
 * @returns Record<flagKey, resolvedBoolean>
 */
export async function getFlags(context: FlagContext): Promise<Record<string, boolean>> {
  try {
    const flags = await loadFlags()
    const result: Record<string, boolean> = {}

    for (const [key] of flags) {
      result[key] = await evaluateFlag(key, context)
    }

    return result
  } catch (err) {
    logger.error({ err }, "flags: getFlags error — returning empty map")
    return {}
  }
}
