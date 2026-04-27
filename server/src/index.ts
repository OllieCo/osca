// Tracer must be the very first import — OTel auto-instrumentation patches modules at load time
import "./lib/tracer.js"
import "./lib/config.js" // validate env at boot
import { initialiseSentry } from "./lib/sentry.js"
import * as Sentry from "@sentry/node"
import express from "express"
import cors from "cors"
import helmet from "helmet"
import pinoHttp from "pino-http"
import { config } from "./lib/config.js"
import { logger } from "./lib/logger.js"
import { requestContextMiddleware } from "./lib/request-context.js"
import healthRouter from "./routes/health.js"
import agentRouter from "./routes/agent.js"
import detokenizeRouter from "./routes/detokenize.js"
import chatRouter from "./routes/chat.js"
import { globalLimiter, agentLimiter, healthLimiter } from "./lib/rate-limit.js"
import { abuseSignalMiddleware } from "./lib/abuse-signals.js"

initialiseSentry()

const app = express()

// Security headers: HSTS, X-Frame-Options, X-Content-Type-Options,
// Referrer-Policy, Permissions-Policy, X-XSS-Protection, CSP.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'none'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    hsts: {
      maxAge: 63_072_000,
      includeSubDomains: true,
      preload: true,
    },
  })
)

// Thread request_id + tenant_id through async context for all downstream logs
app.use(requestContextMiddleware)

// Structured request logging — JSON in prod, pretty in dev. No PII.
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/api/health" },
    customProps: (req) => ({
      request_id: req.headers["x-request-id"],
      tenant_id: req.headers["x-tenant-id"] ?? undefined,
    }),
  })
)
app.use(cors({ origin: config.CORS_ORIGIN }))
app.use(express.json({ limit: "2mb" }))

// ── Rate limiting ──────────────────────────────────────────────────────────────
app.use(globalLimiter)
app.use("/api/health", healthLimiter)
app.use("/api/agent", agentLimiter)

// ── Abuse signal logging (401 / 429 / 400 spikes) ─────────────────────────────
app.use(abuseSignalMiddleware)

app.use("/api", healthRouter)
app.use("/api", agentRouter)
app.use("/api", detokenizeRouter)
app.use("/api", chatRouter)

// Sentry error handler must come after routes, before other error handlers
if (config.SENTRY_DSN) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(Sentry.expressErrorHandler() as unknown as express.ErrorRequestHandler)
}

app.listen(config.PORT, () => {
  const envLabel = config.OSPA_ENV !== "prod" ? ` [ENV: ${config.OSPA_ENV.toUpperCase()}]` : ""
  logger.info(`OSPA API listening on http://localhost:${config.PORT}${envLabel}`)
})

export default app
