import { Router } from "express"
import { pingOllama, listModels } from "../lib/inference-client.js"
import { config } from "../lib/config.js"
import { db } from "../lib/db.js"
import { redis } from "../lib/redis.js"

const router = Router()

router.get("/health", async (_req, res) => {
  const [ollama, postgres, redisOk] = await Promise.all([
    pingOllama().catch(() => false),
    db.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then((r) => r === "PONG").catch(() => false),
  ])

  const models = ollama ? await listModels().catch(() => []) : []

  const ok = postgres && redisOk
  const status = ok ? 200 : 503

  res.status(status).json({
    ok,
    env: config.OSPA_ENV,
    services: {
      postgres,
      redis: redisOk,
      ollama,
    },
    models,
    ts: Date.now(),
  })
})

export default router
