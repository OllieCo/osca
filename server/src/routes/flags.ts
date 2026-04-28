/**
 * routes/flags.ts — GET /api/flags
 *
 * Returns the resolved feature-flag map for the requesting school.
 * The extension caches this response for FLAG_CACHE_TTL_SECONDS (5 min).
 *
 * POST /api/flags/refresh — invalidates the server-side flag cache immediately.
 * Intended for Admin Console writes; rate-limited to prevent abuse.
 *
 * School identity: reads x-school-id header (same stub used by freemiumGuard).
 * Swap to req.auth.schoolId once Auth Unification lands.
 */

import { Router } from "express"
import type { Request, Response } from "express"
import { getFlags, invalidateFlagCache, FLAG_CACHE_TTL_MS } from "../lib/flags.js"
import { getSchoolId, getSchoolPlan } from "../lib/freemium.js"
import { logger } from "../lib/logger.js"

const router = Router()

const FLAG_CACHE_TTL_SECONDS = Math.floor(FLAG_CACHE_TTL_MS / 1000)

// ── GET /api/flags ─────────────────────────────────────────────────────────────

router.get("/flags", async (req: Request, res: Response) => {
  const schoolId = getSchoolId(req)

  // Resolve plan so the evaluator can apply tier gates.
  // Fail-open: if plan lookup throws, treat as FREE (safe — tier-gated flags stay off).
  let plan: "FREE" | "TIER_1" | "TIER_2" = "FREE"
  if (schoolId) {
    try {
      plan = await getSchoolPlan(schoolId)
    } catch (err) {
      logger.warn({ err, schoolId }, "flags route: plan lookup failed — defaulting to FREE")
    }
  }

  const flags = await getFlags({ schoolId, plan })

  // Set Cache-Control so the extension/browser caches for one TTL window.
  res.set("Cache-Control", `public, max-age=${FLAG_CACHE_TTL_SECONDS}`)

  res.json({
    flags,
    evaluated_at: new Date().toISOString(),
    cache_ttl_seconds: FLAG_CACHE_TTL_SECONDS,
  })
})

// ── POST /api/flags/refresh ────────────────────────────────────────────────────

router.post("/flags/refresh", (req: Request, res: Response) => {
  // Simple shared-secret guard until Admin Console auth is wired.
  // Rotate via ADMIN_SECRET env var; omit in tests.
  const { ADMIN_SECRET } = process.env
  const authHeader = req.headers["authorization"]

  if (ADMIN_SECRET && authHeader !== `Bearer ${ADMIN_SECRET}`) {
    res.status(401).json({ error: "unauthorized" })
    return
  }

  invalidateFlagCache()
  logger.info({ ip: req.ip }, "flags: cache invalidated via API")
  res.json({ ok: true, message: "Flag cache invalidated" })
})

export default router
