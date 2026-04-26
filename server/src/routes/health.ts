import { Router } from "express"
import { pingOllama, listModels } from "../lib/inference-client.js"
import { config } from "../lib/config.js"

const router = Router()

router.get("/health", async (_req, res) => {
  const ollama = await pingOllama()
  const models = ollama ? await listModels() : []
  res.json({
    ok: true,
    env: config.DISPATCHER_ENV,
    ollama,
    models,
    ts: Date.now(),
  })
})

export default router
