/**
 * rate-limit.test.ts
 *
 * Tests for the rate limiting middleware and abuse signal logger.
 * Uses vi.mock to avoid real Redis connections in CI.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import express, { type Request, type Response } from "express"

// ── Mock Redis so rate-limit-redis doesn't connect ───────────────────────────

vi.mock("./redis.js", () => ({
  redis: {
    // rate-limit-redis calls SCRIPT LOAD (expects a SHA string back) then
    // EVALSHA (expects [hitCount, resetTimestamp]).  Return plausible stubs
    // so the RedisStore initialises cleanly without a real Redis server.
    call: vi.fn().mockImplementation((...args: unknown[]) => {
      const cmd = String(args[0]).toUpperCase()
      if (cmd === "SCRIPT") return Promise.resolve("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2")
      if (cmd === "EVALSHA") return Promise.resolve([1, Date.now() + 60_000])
      return Promise.resolve(null)
    }),
    on: vi.fn(),
    ping: vi.fn().mockResolvedValue("PONG"),
  },
}))

vi.mock("./logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { globalLimiter, agentLimiter, healthLimiter } from "./rate-limit.js"
import { abuseSignalMiddleware } from "./abuse-signals.js"
import { logger } from "./logger.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeApp(...middlewares: express.RequestHandler[]) {
  const app = express()
  app.set("trust proxy", 1)
  app.use(express.json())
  for (const mw of middlewares) app.use(mw)
  app.get("/test", (_req: Request, res: Response) => res.json({ ok: true }))
  app.post("/test", (_req: Request, res: Response) => res.json({ ok: true }))
  return app
}

async function hit(app: express.Express, path = "/test", ip = "1.2.3.4") {
  const res = await fetch(`http://localhost:9997${path}`, {
    headers: { "x-forwarded-for": ip },
  })
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()) }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("globalLimiter", () => {
  it("allows requests under the limit", async () => {
    const app = makeApp(globalLimiter)
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(9997, () => resolve(s))
    })
    try {
      const { status } = await hit(app)
      expect(status).toBe(200)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("includes RateLimit headers in response", async () => {
    const app = makeApp(globalLimiter)
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(9997, () => resolve(s))
    })
    try {
      const { headers } = await hit(app)
      // draft-7 sends a combined "RateLimit" header; draft-6 sends "RateLimit-Limit".
      // Accept either form — the presence of any rate-limit header is sufficient.
      const hasRateLimitHeader =
        headers["ratelimit"] !== undefined ||        // draft-7 combined
        headers["ratelimit-limit"] !== undefined ||  // draft-6 / legacy
        headers["x-ratelimit-limit"] !== undefined   // older format
      expect(hasRateLimitHeader).toBe(true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe("abuseSignalMiddleware", () => {
  beforeEach(() => {
    vi.mocked(logger.warn).mockClear()
  })

  it("logs a warning when a 401 response is sent", async () => {
    const app = express()
    app.use(abuseSignalMiddleware)
    app.get("/secure", (_req: Request, res: Response) => res.status(401).json({ error: "unauthorized" }))

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(9997, () => resolve(s))
    })
    try {
      await fetch("http://localhost:9997/secure")
      expect(logger.warn).toHaveBeenCalledOnce()
      const [meta] = vi.mocked(logger.warn).mock.calls[0]
      expect((meta as Record<string, unknown>).abuse_signal).toBe(true)
      expect((meta as Record<string, unknown>).status).toBe(401)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("logs a warning when a 429 response is sent", async () => {
    const app = express()
    app.use(abuseSignalMiddleware)
    app.get("/rate-limited", (_req: Request, res: Response) => res.status(429).json({ error: "too many requests" }))

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(9997, () => resolve(s))
    })
    try {
      await fetch("http://localhost:9997/rate-limited")
      expect(logger.warn).toHaveBeenCalledOnce()
      const [meta] = vi.mocked(logger.warn).mock.calls[0]
      expect((meta as Record<string, unknown>).status).toBe(429)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("does NOT log for successful 200 responses", async () => {
    const app = express()
    app.use(abuseSignalMiddleware)
    app.get("/ok", (_req: Request, res: Response) => res.status(200).json({ ok: true }))

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(9997, () => resolve(s))
    })
    try {
      await fetch("http://localhost:9997/ok")
      expect(logger.warn).not.toHaveBeenCalled()
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it("does NOT include query string in logged path (avoids token leakage)", async () => {
    const app = express()
    app.use(abuseSignalMiddleware)
    app.get("/search", (_req: Request, res: Response) => res.status(401).json({ error: "unauthorized" }))

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(9997, () => resolve(s))
    })
    try {
      await fetch("http://localhost:9997/search?token=super-secret-token")
      const [meta] = vi.mocked(logger.warn).mock.calls[0]
      // path should be just "/search" — no query string
      expect((meta as Record<string, unknown>).path).toBe("/search")
      expect(JSON.stringify(meta)).not.toContain("super-secret-token")
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

describe("agentLimiter and healthLimiter exports", () => {
  it("agentLimiter is a middleware function", () => {
    expect(typeof agentLimiter).toBe("function")
  })

  it("healthLimiter is a middleware function", () => {
    expect(typeof healthLimiter).toBe("function")
  })
})
