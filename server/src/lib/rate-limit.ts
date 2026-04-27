/**
 * rate-limit.ts — express-rate-limit middleware with Redis store
 *
 * Three tiers of protection:
 *
 *  1. globalLimiter   — 300 req/min per IP across all routes (DoS floor)
 *  2. agentLimiter    — 20 req/min per IP on /api/agent/* (inference cost guard)
 *  3. healthLimiter   — 60 req/min per IP on /api/health (prevent probe spam)
 *
 * Uses Redis as the backing store (RedisStore from rate-limit-redis) so the
 * counters survive server restarts and will work correctly when we scale to
 * multiple instances. Falls back gracefully to in-memory if Redis is
 * unavailable at startup — rate limiting is defence-in-depth, not a hard
 * dependency.
 *
 * Cloudflare edge rules (Story 1.1.1) will be added once ospa.app is live.
 * These server-side limits act as a second layer of protection.
 */

import rateLimit, { type Options } from "express-rate-limit"
import { RedisStore } from "rate-limit-redis"
import { redis } from "./redis.js"
import { logger } from "./logger.js"

// ── Redis store (shared with BullMQ / sessions) ───────────────────────────────
// rate-limit-redis uses a thin sendCommand wrapper over the existing ioredis client.

function makeRedisStore(prefix: string) {
  try {
    return new RedisStore({
      // rate-limit-redis v4 expects a sendCommand function matching the
      // node-redis interface; ioredis exposes it via the call method.
      sendCommand: (...args: string[]) => redis.call(...args) as Promise<unknown>,
      prefix,
    })
  } catch (err) {
    logger.warn({ err }, "rate-limit-redis: could not create Redis store — falling back to memory")
    return undefined
  }
}

// ── Shared handler options ─────────────────────────────────────────────────────

const sharedOptions: Partial<Options> = {
  standardHeaders: "draft-7",   // RateLimit-* headers per RFC 6585 draft-7
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (_req, res, _next, options) => {
    logger.warn(
      { ip: _req.ip, path: _req.path, limit: options.limit, windowMs: options.windowMs },
      "rate limit exceeded"
    )
    res.status(429).json({
      error: "Too many requests",
      retryAfter: Math.ceil(options.windowMs / 1000),
    })
  },
}

// ── Limiters ──────────────────────────────────────────────────────────────────

/**
 * Global floor — applied to every route.
 * 300 requests/minute per IP. Stops trivial DoS and ensures the API
 * stays responsive under unexpected traffic spikes.
 */
export const globalLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60_000,
  limit: 300,
  store: makeRedisStore("rl:global:"),
})

/**
 * Inference endpoint guard — applied to /api/agent/*.
 * 20 requests/minute per IP. Each request triggers an Ollama inference
 * which costs real compute. This cap prevents a single client from
 * monopolising the inference queue or burning the model budget.
 *
 * Chosen ceiling: 20 req/min ≈ one action every 3 seconds — well above
 * legitimate human usage patterns (teachers click at human speed).
 */
export const agentLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60_000,
  limit: 20,
  store: makeRedisStore("rl:agent:"),
  skip: (req) => req.path.endsWith("/job/") || req.method === "GET",
})

/**
 * Health endpoint guard — applied to /api/health.
 * 60 requests/minute per IP. Grafana synthetic probes check every 60s;
 * this limit allows probes + a developer polling without unbounded hammering.
 */
export const healthLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 60_000,
  limit: 60,
  store: makeRedisStore("rl:health:"),
})
