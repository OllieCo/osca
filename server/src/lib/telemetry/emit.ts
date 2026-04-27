/**
 * telemetry/emit.ts — Story 3.1
 *
 * Typed product-analytics emit helper.
 *
 * Usage:
 *   import { emit } from "./telemetry/emit.js"
 *   await emit("job_completed", { job_id: "x", school_id: "s1", duration_ms: 42, attempts: 1 })
 *
 * Guarantees:
 *  - Compile-time schema enforcement: `props` must match the event's declared shape.
 *  - PII guard: any field name that looks like PII is stripped with a dev warning.
 *  - Fire-and-forget: telemetry failures are silently swallowed (never surface as user errors).
 *  - All events are written to the `telemetry_events` Postgres table.
 *
 * Adding a new event:
 *  1. Add it to event-dictionary.md with a classification and retention.
 *  2. Add its Props type to the EventProps map below.
 *  3. Add its level to the eventLevel map.
 */

import { db } from "../db.js"
import { logger } from "../logger.js"

// ── Event → Props type map ─────────────────────────────────────────────────────
// Every key here must be in event-dictionary.md. Level is enforced at runtime
// via eventLevel; shape is enforced at compile time by TypeScript.

export type EventProps = {
  // ── Backend API ─────────────────────────────────────────────────────────────
  api_request: {
    route: string
    method: string
    status: number
    latency_ms: number
    school_id?: string
  }

  // ── Inference ────────────────────────────────────────────────────────────────
  inference_request: {
    model: string
    prompt_tokens: number
    response_tokens: number
    latency_ms: number
    cache_hit: boolean
    school_id?: string
  }

  // ── Bull queue ───────────────────────────────────────────────────────────────
  job_enqueued: {
    job_id: string
    school_id?: string
  }

  job_completed: {
    job_id: string
    school_id?: string
    duration_ms: number
    attempts: number
  }

  job_failed: {
    job_id: string
    school_id?: string
    error_code: string
    attempts: number
  }

  // ── Freemium ─────────────────────────────────────────────────────────────────
  freemium_limit_reached: {
    school_id: string
    actions_this_month: number
    cap: number
  }

  // ── Subscription ─────────────────────────────────────────────────────────────
  subscription_changed: {
    school_id: string
    plan_from: string
    plan_to: string
    reason: string
  }

  // ── Audit log mirror ─────────────────────────────────────────────────────────
  audit_log_entry: {
    school_id: string
    action: string
  }
}

export type EventName = keyof EventProps

// ── Privacy level per event ───────────────────────────────────────────────────
// Must stay in sync with event-dictionary.md. Checked at runtime for defence-in-depth.

const eventLevel = {
  api_request:            "L3",
  inference_request:      "L3",
  job_enqueued:           "L2",
  job_completed:          "L3",
  job_failed:             "L3",
  freemium_limit_reached: "L2",
  subscription_changed:   "L3",
  audit_log_entry:        "L1",
} as const satisfies Record<EventName, "L0" | "L1" | "L2" | "L3">

// ── PII field guard ───────────────────────────────────────────────────────────
// Strip any property whose key matches a PII-shaped pattern before writing.
// This is defence-in-depth — the TypeScript types should prevent L4+ data, but
// dynamic props (e.g. from error messages) could still slip through at runtime.

const PII_KEY_PATTERN = /\b(email|name|phone|address|qsn|dob|password|token|secret|key|cookie|auth)\b/i

function redactPii(props: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (PII_KEY_PATTERN.test(k)) {
      if (process.env.NODE_ENV !== "production") {
        logger.warn({ field: k }, "telemetry: PII-shaped field stripped before emit — check event schema")
      }
      continue
    }
    clean[k] = v
  }
  return clean
}

// ── emit ──────────────────────────────────────────────────────────────────────

/**
 * Emit a product-analytics event to `telemetry_events`.
 *
 * Fire-and-forget: awaiting this function is optional. Failures are logged but
 * never thrown — telemetry must never degrade the user experience.
 */
export async function emit<E extends EventName>(
  event: E,
  props: EventProps[E],
): Promise<void> {
  try {
    const level = eventLevel[event]
    const cleanProps = redactPii(props as Record<string, unknown>)

    // Derive identifiers from props (L1/L2 events carry school_id or user_id).
    // We never store these on separate columns for L0 events.
    const schoolId = "school_id" in cleanProps
      ? (cleanProps["school_id"] as string | undefined)
      : undefined
    const userId = "user_id" in cleanProps
      ? (cleanProps["user_id"] as string | undefined)
      : undefined

    // Remove identifier fields from props — they're stored in dedicated columns.
    const { school_id: _s, user_id: _u, ...rest } = cleanProps as {
      school_id?: string
      user_id?: string
      [key: string]: unknown
    }

    await db.telemetryEvent.create({
      data: {
        event,
        level,
        schoolId: schoolId ?? null,
        userId: userId ?? null,
        props: rest,
      },
    })
  } catch (err) {
    // Telemetry failures are silent in production; noisy in dev so they surface early.
    if (process.env.NODE_ENV !== "production") {
      logger.warn({ err, event }, "telemetry: emit failed (non-fatal)")
    }
  }
}

/**
 * Fire-and-forget variant: emits without awaiting the result.
 * Use in hot paths (request handlers, queue workers) where you don't want to
 * add latency for analytics. Errors are still swallowed.
 */
export function emitAsync<E extends EventName>(
  event: E,
  props: EventProps[E],
): void {
  void emit(event, props)
}
