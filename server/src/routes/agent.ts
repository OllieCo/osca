import { Router } from "express"
import type { Request, Response } from "express"
import { v4 as uuidv4 } from "uuid"
import { planNextAction } from "../lib/action-planner.js"
import type { AgentSession, AgentAction, ScrapedRecord } from "../types/index.js"
import { validateBody, AgentStartBody, AgentActionResultBody, ScrapeBody } from "../lib/validate.js"

const router = Router()

// In-memory session store — sufficient for local PoC
const sessions = new Map<string, AgentSession>()

// POST /api/agent/start — client starts a new agent run
router.post("/agent/start", validateBody(AgentStartBody), async (req: Request, res: Response) => {
  const { goal } = req.body as { goal: string }

  const session: AgentSession = {
    id: uuidv4(),
    goal: goal.trim().slice(0, 2000),
    status: "planning",
    steps: [],
    currentPage: null,
    pendingAction: null,
    startedAt: Date.now(),
  }
  sessions.set(session.id, session)

  // Plan the first action async — content script will poll for it
  planFirstAction(session).catch((err: unknown) => {
    session.status = "failed"
    session.error = err instanceof Error ? err.message : String(err)
  })

  res.json({ sessionId: session.id })
})

// GET /api/agent/status — client polls for UI updates
router.get("/agent/status", (req: Request, res: Response) => {
  const session = getSession(req, res)
  if (!session) return
  res.json(sessionToClient(session))
})

// GET /api/agent/next-action — content script polls for pending action to execute
router.get("/agent/next-action", (req: Request, res: Response) => {
  const session = getSession(req, res)
  if (!session) return

  if (session.pendingAction) {
    const action = session.pendingAction
    session.status = "executing"
    res.json({ action })
  } else {
    res.json({ action: null })
  }
})

// POST /api/agent/action-result — content script posts execution outcome
router.post("/agent/action-result", validateBody(AgentActionResultBody), async (req: Request, res: Response) => {
  const session = getSession(req, res)
  if (!session) return

  const { success, result, newPageUrl } = req.body as {
    success: boolean
    result?: string
    newPageUrl?: string
  }

  if (session.pendingAction) {
    session.steps.push({
      id: uuidv4(),
      action: session.pendingAction,
      status: success ? "done" : "failed",
      result: result ?? "",
      timestamp: Date.now(),
    })
    session.pendingAction = null

    if (newPageUrl) session.currentPage = { ...session.currentPage!, url: newPageUrl }

    const lastAction = session.steps[session.steps.length - 1].action
    if (lastAction.type === "done" || lastAction.type === "error") {
      session.status = lastAction.type === "done" ? "done" : "failed"
      res.json({ ok: true })
      return
    }

    if (!success) {
      session.status = "failed"
      session.error = result
      res.json({ ok: true })
      return
    }
  }

  // Plan next action
  session.status = "planning"
  res.json({ ok: true })

  planNextStep(session).catch((err: unknown) => {
    session.status = "failed"
    session.error = err instanceof Error ? err.message : String(err)
  })
})

// POST /api/scrape — content script posts scraped page data
router.post("/scrape", validateBody(ScrapeBody), (req: Request, res: Response) => {
  const { sessionId, record } = req.body as { sessionId: string; record: ScrapedRecord }

  const session = sessions.get(sessionId)
  if (!session) {
    res.status(404).json({ error: "session not found" })
    return
  }

  session.currentPage = record
  res.json({ ok: true })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function planFirstAction(session: AgentSession): Promise<void> {
  const action = await planNextAction(session.goal, session.currentPage, session.steps)
  action.id = uuidv4()
  session.pendingAction = action
  session.status = "awaiting"
}

async function planNextStep(session: AgentSession): Promise<void> {
  const action = await planNextAction(session.goal, session.currentPage, session.steps)
  action.id = uuidv4()
  session.pendingAction = action
  session.status = "awaiting"
}

function getSession(req: Request, res: Response): AgentSession | null {
  const sessionId = (req.query.sessionId ?? req.body?.sessionId) as string | undefined
  if (!sessionId) {
    res.status(400).json({ error: "sessionId required" })
    return null
  }
  const session = sessions.get(sessionId)
  if (!session) {
    res.status(404).json({ error: "session not found" })
    return null
  }
  return session
}

function sessionToClient(session: AgentSession) {
  return {
    id: session.id,
    goal: session.goal,
    status: session.status,
    steps: session.steps,
    currentPageUrl: session.currentPage?.url ?? "",
    startedAt: session.startedAt,
    error: session.error,
    hasPendingAction: session.pendingAction !== null,
    pendingAction: session.pendingAction as AgentAction | null,
    hasPartialCapture: session.currentPage?.tableData?.some(
      (t) => t.meta.isVirtual && t.meta.pageInfo?.hasMore === true
    ) ?? false,
  }
}

export default router
