import { describe, it, expect, vi } from "vitest"
import { scrubEvent } from "./sentry.test-helpers.js"
import { PiiSpanProcessor } from "./pii-span-processor.js"
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base"
import type { SpanProcessor } from "@opentelemetry/sdk-trace-base"

// ── Sentry PII contract ───────────────────────────────────────────────────────
describe("Sentry PII scrubber", () => {
  it("redacts authorization header", () => {
    const event = {
      request: { headers: { authorization: "Bearer secret-token", "content-type": "application/json" } },
    }
    const scrubbed = scrubEvent(event as Parameters<typeof scrubEvent>[0])
    expect(scrubbed.request?.headers?.["authorization"]).toBe("[redacted]")
    expect(scrubbed.request?.headers?.["content-type"]).toBe("application/json")
  })

  it("redacts cookie header", () => {
    const event = { request: { headers: { cookie: "session=abc123" } } }
    const scrubbed = scrubEvent(event as Parameters<typeof scrubEvent>[0])
    expect(scrubbed.request?.headers?.["cookie"]).toBe("[redacted]")
  })

  it("redacts request body entirely", () => {
    const event = { request: { data: JSON.stringify({ email: "teacher@school.edu", goal: "check relief" }) } }
    const scrubbed = scrubEvent(event as Parameters<typeof scrubEvent>[0])
    expect(scrubbed.request?.data).toBe("[redacted]")
  })

  it("redacts PII fields in extra context", () => {
    const event = { extra: { email: "test@example.com", requestId: "abc-123", tenantId: "t1" } }
    const scrubbed = scrubEvent(event as Parameters<typeof scrubEvent>[0])
    expect(scrubbed.extra?.["email"]).toBe("[redacted]")
    // Non-PII fields preserved
    expect(scrubbed.extra?.["requestId"]).toBe("abc-123")
    expect(scrubbed.extra?.["tenantId"]).toBe("t1")
  })
})

// ── OTel PII span-processor contract ─────────────────────────────────────────
describe("PiiSpanProcessor", () => {
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

  it("strips email attributes before export", () => {
    const delegate = makeDelegate()
    const processor = new PiiSpanProcessor(delegate)
    const span = makeSpan({ "user.email": "teacher@school.edu", "http.method": "POST" })
    processor.onEnd(span)
    expect(delegate.received[0]?.attributes["user.email"]).toBe("[redacted]")
    expect(delegate.received[0]?.attributes["http.method"]).toBe("POST")
  })

  it("strips name attributes before export", () => {
    const delegate = makeDelegate()
    const processor = new PiiSpanProcessor(delegate)
    const span = makeSpan({ "user.name": "Jane Smith", "service.version": "1.0.0" })
    processor.onEnd(span)
    expect(delegate.received[0]?.attributes["user.name"]).toBe("[redacted]")
    expect(delegate.received[0]?.attributes["service.version"]).toBe("1.0.0")
  })

  it("drops span entirely if scrubbing throws (fail-closed)", () => {
    const delegate = makeDelegate()
    const processor = new PiiSpanProcessor(delegate)
    // Simulate a non-plain-object attributes (causes Object.entries to throw in scrub)
    const span = { attributes: null } as unknown as ReadableSpan
    expect(() => processor.onEnd(span)).not.toThrow()
    // Span should NOT have been forwarded
    expect(delegate.received).toHaveLength(0)
  })

  it("passes non-PII spans through unchanged", () => {
    const delegate = makeDelegate()
    const processor = new PiiSpanProcessor(delegate)
    const span = makeSpan({ "http.method": "GET", "http.status_code": 200, "request_id": "abc-123" })
    processor.onEnd(span)
    expect(delegate.received[0]?.attributes["http.method"]).toBe("GET")
    expect(delegate.received[0]?.attributes["http.status_code"]).toBe(200)
    expect(delegate.received[0]?.attributes["request_id"]).toBe("abc-123")
  })
})
