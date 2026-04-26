// Boot-time config validation.
// The app refuses to start if any required variable is absent or malformed.
// Import this module before anything else in index.ts.

import { z } from "zod"

const EnvSchema = z.object({
  // Runtime identity
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  DISPATCHER_ENV: z
    .enum(["dev", "staging", "prod"])
    .default("dev"),

  // Network
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGIN: z.string().url().default("http://localhost:3000"),

  // Inference
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().min(1).default("gemma4:12b"),

  // Persistence
  DATABASE_URL: z.string().url().default("postgresql://dispatcher:dispatcher@localhost:5432/dispatcher_dev"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),

  // Observability (optional — omit to disable OTel/Sentry)
  GRAFANA_OTLP_ENDPOINT: z.string().url().optional(),
  GRAFANA_OTLP_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),

  // ── Future — required once Platform tier lands ──────────────────────────
  // JWT_SECRET:         z.string().min(32),
  // STRIPE_SECRET_KEY:  z.string().startsWith("sk_"),
  // RESEND_API_KEY:     z.string().min(1),
})

const result = EnvSchema.safeParse(process.env)

if (!result.success) {
  console.error("Config validation failed — refusing to start:")
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`)
  }
  process.exit(1)
}

export const config = result.data
export type Config = typeof config
