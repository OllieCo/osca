/**
 * freemium.ts — Story 3.3
 *
 * Express middleware that enforces the Freemium monthly action cap (100 actions/month).
 *
 * How it works:
 *  1. Reads the school's active subscription plan from the `subscriptions` table.
 *  2. For FREE-plan schools, counts `action_executed` telemetry rows within the
 *     current calendar month.
 *  3. If the count >= FREEMIUM_ACTION_CAP, returns 402 with a `freemium_limit_reached`
 *     payload and emits a telemetry event.
 *  4. ACTIVE / TRIALING paid plans are let through unconditionally.
 *
 * School identity:
 *  Currently sourced from the `x-school-id` request header (temporary stub until the
 *  Auth Unification project lands and populates `req.auth.schoolId`). Once auth is
 *  live, swap `getSchoolId()` to read from the JWT claims without changing anything else.
 *
 * Apply this middleware to action-execution routes only, not to read-only or polling routes.
 *
 *   app.use("/api/agent/action-result", freemiumGuard)
 */

import type { Request, Response, NextFunction } from "express"
import { db } from "./db.js"
import { logger } from "./logger.js"
import { emitAsync } from "./telemetry/emit.js"

export const FREEMIUM_ACTION_CAP = 100

// ── School ID resolution ───────────────────────────────────────────────────────
// Temporary: read from the x-school-id header.
// Replace with: return req.auth?.schoolId   once JWT auth lands.

export function getSchoolId(req: Request): string | null {
  const header = req.headers["x-school-id"]
  if (typeof header === "string" && header.length > 0) return header
  return null
}

// ── Action count helper ────────────────────────────────────────────────────────

/**
 * Count `action_executed` telemetry rows for a school in the current UTC calendar month.
 * Used only for FREE-plan schools — paid schools skip the check entirely.
 */
export async function countMonthlyActions(schoolId: string): Promise<number> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const count = await db.telemetryEvent.count({
    where: {
      schoolId,
      event: "action_executed",
      createdAt: { gte: monthStart },
    },
  })

  return count
}

// ── Subscription plan lookup ───────────────────────────────────────────────────

/**
 * Returns the school's current plan, defaulting to FREE if no active subscription exists.
 */
export async function getSchoolPlan(schoolId: string): Promise<"FREE" | "TIER_1" | "TIER_2"> {
  const sub = await db.subscription.findFirst({
    where: {
      schoolId,
      status: { in: ["ACTIVE", "TRIALING"] },
    },
    orderBy: { createdAt: "desc" },
    select: { plan: true },
  })

  return sub?.plan ?? "FREE"
}

// ── Middleware ─────────────────────────────────────────────────────────────────

/**
 * freemiumGuard — apply to action-execution routes.
 *
 * Passes through if:
 *  - No school ID can be resolved (auth not yet wired — optimistic until auth lands)
 *  - School is on a paid plan (TIER_1 or TIER_2)
 *  - School is on FREE plan but has < FREEMIUM_ACTION_CAP actions this month
 *
 * Returns 402 if:
 *  - School is on FREE plan and has >= FREEMIUM_ACTION_CAP actions this month
 */
export async function freemiumGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const schoolId = getSchoolId(req)

  // No school identity yet (pre-auth) — let through until auth lands
  if (!schoolId) {
    next()
    return
  }

  try {
    const plan = await getSchoolPlan(schoolId)

    // Paid plans have no monthly cap
    if (plan !== "FREE") {
      next()
      return
    }

    // FREE plan — check action count
    const actionsThisMonth = await countMonthlyActions(schoolId)

    if (actionsThisMonth >= FREEMIUM_ACTION_CAP) {
      logger.info(
        { schoolId, actionsThisMonth, cap: FREEMIUM_ACTION_CAP },
        "freemium: action cap reached"
      )

      emitAsync("freemium_limit_reached", {
        school_id: schoolId,
        actions_this_month: actionsThisMonth,
        cap: FREEMIUM_ACTION_CAP,
      })

      res.status(402).json({
        error: "freemium_limit_reached",
        message: `Your free plan allows ${FREEMIUM_ACTION_CAP} actions per month. Upgrade to continue.`,
        actions_this_month: actionsThisMonth,
        cap: FREEMIUM_ACTION_CAP,
        upgrade_url: "https://dispatcher.app/pricing",
      })
      return
    }

    next()
  } catch (err) {
    // Enforcement errors must never block the user — log and pass through.
    // The action goes through; a monitoring alert on this error pattern is
    // more appropriate than silently degrading service.
    logger.error({ err, schoolId }, "freemiumGuard: DB error during plan check — allowing request")
    next()
  }
}
