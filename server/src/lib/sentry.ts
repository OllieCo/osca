import * as Sentry from "@sentry/node"
import { config } from "./config.js"
import { scrubEvent } from "./sentry.test-helpers.js"

export function initialiseSentry(): void {
  if (!config.SENTRY_DSN) return

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.OSPA_ENV,
    release: process.env["npm_package_version"],
    // Fail-closed PII scrubber — runs on every event before sending
    beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
      return scrubEvent(event) as Sentry.ErrorEvent
    },
    // Never send PII in breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      const PII = ["email", "name", "password", "token", "authorization", "cookie", "phone"]
      if (breadcrumb.data) {
        for (const key of PII) {
          if (key in (breadcrumb.data as object)) {
            (breadcrumb.data as Record<string, unknown>)[key] = "[redacted]"
          }
        }
      }
      return breadcrumb
    },
    enabled: config.NODE_ENV !== "test",
    tracesSampleRate: config.OSPA_ENV === "prod" ? 0.1 : 0,
  })
}

export { Sentry }
