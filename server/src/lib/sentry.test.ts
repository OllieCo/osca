/**
 * sentry.test.ts — unit tests for the initialiseSentry() wiring function.
 *
 * Strategy: vi.mock() both @sentry/node and the config module so we can
 * control SENTRY_DSN presence/absence and assert Sentry.init call behaviour
 * without touching the real SDK or environment.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSentryInit } = vi.hoisted(() => ({
  mockSentryInit: vi.fn(),
}))

vi.mock("@sentry/node", () => ({
  init: mockSentryInit,
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe("initialiseSentry", () => {
  beforeEach(() => {
    mockSentryInit.mockReset()
    vi.resetModules()
  })

  it("is a no-op when SENTRY_DSN is absent", async () => {
    vi.doMock("./config.js", () => ({
      config: {
        SENTRY_DSN: undefined,
        OSPA_ENV: "dev",
        NODE_ENV: "test",
      },
    }))

    const { initialiseSentry } = await import("./sentry.js")
    initialiseSentry()

    expect(mockSentryInit).not.toHaveBeenCalled()
  })

  it("calls Sentry.init with DSN and environment when DSN is present", async () => {
    const dsn = "https://abc123@o0.ingest.sentry.io/0"

    vi.doMock("./config.js", () => ({
      config: {
        SENTRY_DSN: dsn,
        OSPA_ENV: "staging",
        NODE_ENV: "development",
      },
    }))

    const { initialiseSentry } = await import("./sentry.js")
    initialiseSentry()

    expect(mockSentryInit).toHaveBeenCalledOnce()
    const initArg = mockSentryInit.mock.calls[0][0] as Record<string, unknown>
    expect(initArg.dsn).toBe(dsn)
    expect(initArg.environment).toBe("staging")
  })

  it("sets enabled: false in test environment", async () => {
    const dsn = "https://abc123@o0.ingest.sentry.io/0"

    vi.doMock("./config.js", () => ({
      config: {
        SENTRY_DSN: dsn,
        OSPA_ENV: "dev",
        NODE_ENV: "test",
      },
    }))

    const { initialiseSentry } = await import("./sentry.js")
    initialiseSentry()

    expect(mockSentryInit).toHaveBeenCalledOnce()
    const initArg = mockSentryInit.mock.calls[0][0] as Record<string, unknown>
    expect(initArg.enabled).toBe(false)
  })

  it("sets tracesSampleRate to 0.1 in prod, 0 otherwise", async () => {
    const dsn = "https://abc123@o0.ingest.sentry.io/0"

    // prod
    vi.doMock("./config.js", () => ({
      config: { SENTRY_DSN: dsn, OSPA_ENV: "prod", NODE_ENV: "production" },
    }))
    const { initialiseSentry: initProd } = await import("./sentry.js")
    initProd()
    expect(
      (mockSentryInit.mock.calls[0][0] as Record<string, unknown>).tracesSampleRate
    ).toBe(0.1)

    mockSentryInit.mockReset()
    vi.resetModules()

    // non-prod
    vi.doMock("./config.js", () => ({
      config: { SENTRY_DSN: dsn, OSPA_ENV: "staging", NODE_ENV: "staging" },
    }))
    const { initialiseSentry: initStaging } = await import("./sentry.js")
    initStaging()
    expect(
      (mockSentryInit.mock.calls[0][0] as Record<string, unknown>).tracesSampleRate
    ).toBe(0)
  })
})
