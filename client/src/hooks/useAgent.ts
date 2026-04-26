import { useState, useEffect, useCallback, useRef } from "react"
import type { AgentSession, AgentStatus } from "../types/index"

const API = "/api"
const POLL_MS = 1500

interface AgentState extends Pick<AgentSession, "id" | "goal" | "status" | "steps" | "startedAt"> {
  currentPageUrl: string
  hasPendingAction: boolean
  hasPartialCapture: boolean
  error?: string
}

const IDLE_STATE: AgentState = {
  id: "",
  goal: "",
  status: "idle" as AgentStatus,
  steps: [],
  currentPageUrl: "",
  hasPendingAction: false,
  hasPartialCapture: false,
  startedAt: 0,
}

export function useAgent() {
  const [session, setSession] = useState<AgentState>(IDLE_STATE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const poll = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${API}/agent/status?sessionId=${sessionId}`)
      if (!res.ok) { stopPolling(); return }
      const data = (await res.json()) as AgentState
      setSession(data)
      if (data.status === "done" || data.status === "failed" || data.status === "cancelled") {
        stopPolling()
      }
    } catch {
      // network error — keep polling
    }
  }, [stopPolling])

  const startAgent = useCallback(async (goal: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/agent/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      })
      if (!res.ok) throw new Error(`Server error ${res.status}`)
      const { sessionId } = (await res.json()) as { sessionId: string }
      pollRef.current = setInterval(() => poll(sessionId), POLL_MS)
      await poll(sessionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [poll])

  const reset = useCallback(() => {
    stopPolling()
    setSession(IDLE_STATE)
    setError(null)
  }, [stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  return { session, loading, error, startAgent, reset }
}
