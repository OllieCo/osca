/**
 * metrics.test.ts — verifies that metric instruments are called at the right
 * lifecycle hooks in the relevant modules.
 *
 * Strategy: vi.mock() the metrics module so we control the instrument objects,
 * then import the real consuming modules and exercise them.  The OTel API
 * returns no-op instruments in test env anyway, but mocking lets us assert
 * that .add() / .record() were called with the expected arguments.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock the metrics module BEFORE any consuming module is imported ───────────
//
// vi.mock() factories are hoisted before variable declarations, so any
// variables they reference must be declared via vi.hoisted() to ensure they
// exist at the time the factory runs.

const { mockAdd, mockRecord } = vi.hoisted(() => ({
  mockAdd: vi.fn(),
  mockRecord: vi.fn(),
}))

vi.mock("./metrics.js", () => ({
  inferenceQueueWaiting: { add: mockAdd },
  inferenceQueueActive: { add: mockAdd },
  inferenceJobsCompleted: { add: mockAdd },
  inferenceJobsFailed: { add: mockAdd },
  inferenceDuration: { record: mockRecord },
  actionsTotal: { add: mockAdd },
  piiBlocksTotal: { add: mockAdd },
}))

// ── PiiSpanProcessor — piiBlocksTotal counter ─────────────────────────────────

import { PiiSpanProcessor } from "./pii-span-processor.js"
import type { ReadableSpan, SpanProcessor } from "@opentelemetry/sdk-trace-base"

function makeSpan(attributes: Record<string, unknown>): ReadableSpan {
  return { attributes } as unknown as ReadableSpan
}

function makeDelegate(): SpanProcessor & { received: ReadableSpan[] } {
  const received: ReadableSpan[] = []
  return {
    received,
    onStart: vi.fn(),
    onEnd: (span) => received.push(span),
    shutdown: async () => {},
    forceFlush: async () => {},
  }
}

describe("PiiSpanProcessor — piiBlocksTotal", () => {
  beforeEach(() => {
    mockAdd.mockClear()
  })

  it("increments piiBlocksTotal when a span contains PII attributes", () => {
    const delegate = makeDelegate()
    const processor = new PiiSpanProcessor(delegate)
    processor.onEnd(makeSpan({ "user.email": "teacher@school.edu", "http.method": "POST" }))
    // piiBlocksTotal.add(1) should have been called once
    expect(mockAdd).toHaveBeenCalledWith(1)
  })

  it("does NOT increment piiBlocksTotal for clean spans", () => {
    const delegate = makeDelegate()
    const processor = new PiiSpanProcessor(delegate)
    mockAdd.mockClear()
    processor.onEnd(makeSpan({ "http.method": "GET", "http.status_code": 200 }))
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it("does NOT increment piiBlocksTotal when scrubbing throws (fail-closed path)", () => {
    const delegate = makeDelegate()
    const processor = new PiiSpanProcessor(delegate)
    mockAdd.mockClear()
    // null attributes causes Object.keys to throw inside scrubAttributes
    processor.onEnd({ attributes: null } as unknown as ReadableSpan)
    expect(mockAdd).not.toHaveBeenCalled()
    // Span not forwarded to delegate either
    expect(delegate.received).toHaveLength(0)
  })
})

// ── inference-client — inferenceDuration histogram ────────────────────────────

// Mock fetch so the test doesn't make real HTTP calls
global.fetch = vi.fn()

vi.mock("./config.js", () => ({
  config: {
    OLLAMA_BASE_URL: "http://localhost:11434",
    OLLAMA_MODEL: "test-model",
    NODE_ENV: "test",
    OSPA_ENV: "dev",
    PORT: 3001,
    CORS_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://test",
    REDIS_URL: "redis://localhost:6379",
  },
}))

vi.mock("./logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { chatWithOllama } from "./inference-client.js"

describe("inference-client — inferenceDuration histogram", () => {
  beforeEach(() => {
    mockRecord.mockClear()
    vi.mocked(global.fetch).mockClear()
  })

  it("records inferenceDuration after a successful Ollama response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: { content: "test response" } }),
    } as Response)

    await chatWithOllama("test-model", "hello")

    expect(mockRecord).toHaveBeenCalledOnce()
    const [durationMs, attrs] = mockRecord.mock.calls[0]
    expect(typeof durationMs).toBe("number")
    expect(durationMs).toBeGreaterThanOrEqual(0)
    expect(attrs).toEqual({ model: "test-model" })
  })

  it("does NOT record inferenceDuration when Ollama returns an error", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    } as Response)

    await expect(chatWithOllama("test-model", "hello")).rejects.toThrow("Ollama 503")
    expect(mockRecord).not.toHaveBeenCalled()
  })
})
