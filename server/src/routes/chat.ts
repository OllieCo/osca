import { Router } from "express"
import type { Request, Response } from "express"
import { chatWithOllama } from "../lib/inference-client.js"
import { validateBody, ChatBody } from "../lib/validate.js"
import { config } from "../lib/config.js"

const router = Router()

const CHAT_SYSTEM_PROMPT = `You are a helpful assistant for Queensland Department of Education staff using OneSchool.
Answer questions about OneSchool navigation, supervision procedures, and Queensland DoE policy.
Be concise and practical. If you don't know something, say so.`

router.post("/chat", validateBody(ChatBody), async (req: Request, res: Response) => {
  const { message } = req.body as { message: string }

  try {
    const answer = await chatWithOllama(config.OLLAMA_MODEL, message.trim(), CHAT_SYSTEM_PROMPT)
    res.json({ answer })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(502).json({ error: `Ollama error: ${msg}` })
  }
})

export default router
