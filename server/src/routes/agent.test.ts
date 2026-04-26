import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock action-planner so tests don't call Ollama
vi.mock("../lib/action-planner.js", () => ({
  planNextAction: vi.fn().mockResolvedValue({
    id: undefined,
    type: "navigate",
    target: "Supervisions",
    description: "Navigate to Supervisions module",
    reasoning: "Goal requires navigating there first",
    risk: "low",
  }),
}))

import express from "express"
import agentRouter from "./agent.js"
import detokenizeRouter from "./detokenize.js"

const app = express()
app.use(express.json())
app.use("/api", agentRouter)
app.use("/api", detokenizeRouter)

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`http://localhost:9999${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, body: (await res.json()) as any }
}

// Spin up a test server
let server: ReturnType<typeof app.listen>
beforeEach(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(9999, resolve)
  })
  return async () => new Promise<void>((resolve) => server.close(() => resolve()))
})

describe("POST /api/agent/start", () => {
  it("returns a sessionId", async () => {
    const { status, body } = await req("POST", "/api/agent/start", { goal: "Record absence" })
    expect(status).toBe(200)
    expect(body.sessionId).toBeDefined()
  })

  it("returns 422 when goal is missing", async () => {
    const { status } = await req("POST", "/api/agent/start", {})
    expect(status).toBe(422)
  })
})

describe("GET /api/agent/status", () => {
  it("returns session data for valid sessionId", async () => {
    const { body: started } = await req("POST", "/api/agent/start", { goal: "Test goal" })
    const { status, body } = await req("GET", `/api/agent/status?sessionId=${started.sessionId}`)
    expect(status).toBe(200)
    expect(body.goal).toBe("Test goal")
  })

  it("returns 404 for unknown sessionId", async () => {
    const { status } = await req("GET", "/api/agent/status?sessionId=does-not-exist")
    expect(status).toBe(404)
  })
})

describe("POST /api/scrape", () => {
  it("stores scrape record for valid session", async () => {
    const { body: started } = await req("POST", "/api/agent/start", { goal: "Scrape test" })
    const record = {
      url: "https://oslp.eq.edu.au/supervisions",
      timestamp: Date.now(),
      classification: "OFFICIAL:Sensitive",
      fields: [{ label: "Staff Name", tokenizedValue: "[NAME_001]", fieldType: "name" }],
      tableData: [],
    }
    const { status, body } = await req("POST", "/api/scrape", { sessionId: started.sessionId, record })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
  })
})

describe("POST /api/detokenize", () => {
  it("reverses tokens using the provided token map", async () => {
    const { status, body } = await req("POST", "/api/detokenize", {
      text: "Hello [NAME_001], your email is [EMAIL_001]",
      tokenMap: { "[NAME_001]": "Alice Smith", "[EMAIL_001]": "alice@eq.edu.au" },
    })
    expect(status).toBe(200)
    expect(body.result).toBe("Hello Alice Smith, your email is alice@eq.edu.au")
  })

  it("leaves unknown tokens unchanged", async () => {
    const { body } = await req("POST", "/api/detokenize", {
      text: "Hello [NAME_999]",
      tokenMap: {},
    })
    expect(body.result).toBe("Hello [NAME_999]")
  })

  it("returns 422 when body is malformed", async () => {
    const { status } = await req("POST", "/api/detokenize", { text: 42 })
    expect(status).toBe(422)
  })
})
