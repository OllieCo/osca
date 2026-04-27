import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../lib/db.js", () => ({
  db: { $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]) },
}))

vi.mock("../lib/redis.js", () => ({
  redis: { ping: vi.fn().mockResolvedValue("PONG") },
}))

vi.mock("../lib/inference-client.js", () => ({
  pingOllama: vi.fn().mockResolvedValue(true),
  listModels: vi.fn().mockResolvedValue(["gemma4:latest"]),
}))

vi.mock("../lib/config.js", () => ({
  config: {
    OSPA_ENV: "dev",
    OLLAMA_BASE_URL: "http://localhost:11434",
  },
}))

// ── App setup ─────────────────────────────────────────────────────────────────

import express from "express"
import healthRouter from "./health.js"
import { db } from "../lib/db.js"
import { redis } from "../lib/redis.js"
import { pingOllama } from "../lib/inference-client.js"

const app = express()
app.use(express.json())
app.use("/api", healthRouter)

let server: ReturnType<typeof app.listen>

beforeEach(async () => {
  vi.clearAllMocks()
  // Restore healthy defaults
  vi.mocked(db.$queryRaw).mockResolvedValue([{ "?column?": 1 }] as never)
  vi.mocked(redis.ping).mockResolvedValue("PONG")
  vi.mocked(pingOllama).mockResolvedValue(true)
  await new Promise<void>((resolve) => {
    server = app.listen(9998, resolve)
  })
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function get(path: string) {
  const res = await fetch(`http://localhost:9998${path}`)
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 with ok=true when all services are healthy", async () => {
    const { status, body } = await get("/api/health")
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect((body.services as Record<string, unknown>).postgres).toBe(true)
    expect((body.services as Record<string, unknown>).redis).toBe(true)
    expect((body.services as Record<string, unknown>).ollama).toBe(true)
  })

  it("returns 503 with ok=false when Postgres is down", async () => {
    vi.mocked(db.$queryRaw).mockRejectedValue(new Error("connection refused"))
    const { status, body } = await get("/api/health")
    expect(status).toBe(503)
    expect(body.ok).toBe(false)
    expect((body.services as Record<string, unknown>).postgres).toBe(false)
  })

  it("returns 503 with ok=false when Redis is down", async () => {
    vi.mocked(redis.ping).mockRejectedValue(new Error("connection refused"))
    const { status, body } = await get("/api/health")
    expect(status).toBe(503)
    expect(body.ok).toBe(false)
    expect((body.services as Record<string, unknown>).redis).toBe(false)
  })

  it("returns 200 when only Ollama is down (non-critical)", async () => {
    vi.mocked(pingOllama).mockResolvedValue(false)
    const { status, body } = await get("/api/health")
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect((body.services as Record<string, unknown>).ollama).toBe(false)
  })

  it("includes ts timestamp", async () => {
    const before = Date.now()
    const { body } = await get("/api/health")
    expect(typeof body.ts).toBe("number")
    expect(body.ts as number).toBeGreaterThanOrEqual(before)
  })
})
