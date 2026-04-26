// Request-body schemas for every API endpoint.
// All schemas use .strict() — unknown fields are rejected with a 422 error.

import { z } from "zod"
import type { Request, Response, NextFunction } from "express"

// ─── Schemas ────────────────────────────────────────────────────────────────

export const AgentStartBody = z
  .object({ goal: z.string().min(1).max(2000) })
  .strict()

export const AgentActionResultBody = z
  .object({
    sessionId: z.string().uuid(),
    success: z.boolean(),
    result: z.string().max(10_000).optional(),
    newPageUrl: z.string().url().optional(),
  })
  .strict()

export const ScrapeBody = z
  .object({
    sessionId: z.string().uuid(),
    record: z.record(z.string(), z.unknown()),
  })
  .strict()

export const ChatBody = z
  .object({ message: z.string().min(1).max(4000) })
  .strict()

export const DetokenizeBody = z
  .object({
    text: z.string().max(20_000),
    tokenMap: z.record(z.string(), z.string()),
  })
  .strict()

// ─── Middleware factory ──────────────────────────────────────────────────────

export function validateBody<T>(schema: z.ZodType<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      res.status(422).json({
        error: "Invalid request body",
        detail: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      })
      return
    }
    req.body = result.data
    next()
  }
}
