// Structured logger — Pino JSON in production/staging, pretty in dev/test.
// Rules: no PII, no raw field values, no request bodies in logs.
// Log token IDs, status codes, URLs, durations, error types only.

import pino from "pino"
import { config } from "./config.js"

const isDev = config.NODE_ENV === "development" || config.NODE_ENV === "test"

export const logger = pino({
  level: isDev ? "debug" : "info",
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, ignore: "pid,hostname" },
    },
  }),
  // Redact any field that might accidentally carry PII
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body",
      "res.body",
    ],
    censor: "[redacted]",
  },
})
