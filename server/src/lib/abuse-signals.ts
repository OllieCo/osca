/**
 * abuse-signals.ts — Story 3.2.1
 *
 * Response-phase middleware that logs 401 / 429 / 400 responses with enough
 * context to detect abuse spikes in Grafana and alert via the existing
 * ospa-health-down / custom alert rules.
 *
 * Pattern: intercept res.json() to inspect the outgoing status code.
 * We use this (rather than a route-level afterEach hook) so a single
 * middleware registration covers all routes without modifying every handler.
 *
 * What gets logged:
 *  - status code (401 / 429 / 400)
 *  - IP address (from req.ip, already trust-proxy aware via Express)
 *  - HTTP method + path (no query string — avoids leaking tokens in params)
 *  - user-agent truncated to 120 chars
 *
 * What does NOT get logged:
 *  - request body (may contain credentials)
 *  - Authorization header value
 *  - any PII
 */

import type { Request, Response, NextFunction } from "express"
import { logger } from "./logger.js"

const ABUSE_STATUSES = new Set([400, 401, 429])

export function abuseSignalMiddleware(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res)

  res.json = function (body?: unknown) {
    if (ABUSE_STATUSES.has(res.statusCode)) {
      logger.warn(
        {
          abuse_signal: true,
          status: res.statusCode,
          method: req.method,
          // Strip query string to avoid leaking tokens in URL params
          path: req.path,
          ip: req.ip,
          ua: (req.headers["user-agent"] ?? "").slice(0, 120),
        },
        `abuse signal: ${res.statusCode} on ${req.method} ${req.path}`
      )
    }
    return originalJson(body)
  }

  next()
}
