// Exported for contract tests only — not part of the public API
import type * as Sentry from "@sentry/node"

const PII_FIELDS = [
  "email", "name", "displayName", "display_name", "password", "passwordHash",
  "password_hash", "token", "authorization", "cookie", "phone", "address",
  "firstName", "lastName", "first_name", "last_name",
]

function sanitise(obj: unknown, depth = 0): unknown {
  if (depth > 10 || obj === null || typeof obj !== "object") return obj
  if (Array.isArray(obj)) return obj.map((v) => sanitise(v, depth + 1))
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    result[key] = PII_FIELDS.some((f) => key.toLowerCase().includes(f.toLowerCase()))
      ? "[redacted]"
      : sanitise(val, depth + 1)
  }
  return result
}

export function scrubEvent(event: Sentry.Event): Sentry.Event {
  if (event.request) {
    if (event.request.headers) {
      const h = event.request.headers as Record<string, string>
      if (h["authorization"]) h["authorization"] = "[redacted]"
      if (h["cookie"]) h["cookie"] = "[redacted]"
    }
    if (event.request.data) {
      event.request.data = "[redacted]"
    }
  }
  if (event.extra) {
    event.extra = sanitise(event.extra) as typeof event.extra
  }
  return event
}
