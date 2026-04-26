import { Router } from "express"
import type { Request, Response } from "express"
import type { TokenMap } from "../types/index.js"
import { validateBody, DetokenizeBody } from "../lib/validate.js"
import { logger } from "../lib/logger.js"

const router = Router()

// Server-side detokenization — for action dispatch only.
// Logs token IDs only, never raw values (IS18 compliance).
router.post("/detokenize", validateBody(DetokenizeBody), (req: Request, res: Response) => {
  const { text, tokenMap } = req.body as { text: string; tokenMap: TokenMap }

  const TOKEN_RE = /\[([A-Z]+)_(\d{3})\]/g
  const tokenIds: string[] = []

  const result = text.replace(TOKEN_RE, (match) => {
    tokenIds.push(match)  // log token IDs only — never the raw value
    return tokenMap[match] ?? match
  })

  // Log token IDs only — never raw values (IS18 compliance)
  logger.debug({ tokenIds, count: tokenIds.length }, "detokenize resolved")

  res.json({ result })
})

export default router
