import { useState } from "react"
import { useAgent } from "../hooks/useAgent"
import ActionCard from "../components/ActionCard"

const STATUS_LABEL: Record<string, string> = {
  idle: "Ready",
  planning: "Planning…",
  awaiting: "Awaiting execution",
  executing: "Executing…",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
}

const STATUS_COLOR: Record<string, string> = {
  idle: "text-gray-400",
  planning: "text-blue-500",
  awaiting: "text-yellow-600",
  executing: "text-blue-600",
  done: "text-green-600",
  failed: "text-red-600",
  cancelled: "text-gray-500",
}

export default function AgentPage() {
  const { session, loading, error, startAgent, reset } = useAgent()
  const [goal, setGoal] = useState("")

  const isActive = ["planning", "awaiting", "executing"].includes(session.status)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!goal.trim() || isActive) return
    startAgent(goal.trim())
  }

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto w-full p-4 gap-4">
      {/* Goal input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          placeholder="Describe the task — e.g. Record Jane Smith absent for Period 1, reason: Sick"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          disabled={isActive || loading}
        />
        <button
          type="submit"
          disabled={!goal.trim() || isActive || loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 hover:bg-blue-700 transition-colors"
        >
          {loading ? "Starting…" : "Run"}
        </button>
        {session.status !== "idle" && (
          <button
            type="button"
            onClick={reset}
            className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            Reset
          </button>
        )}
      </form>

      {/* Status bar */}
      {session.status !== "idle" && (
        <div className="flex items-center justify-between text-sm px-1">
          <span className={`font-medium ${STATUS_COLOR[session.status] ?? ""}`}>
            {STATUS_LABEL[session.status] ?? session.status}
          </span>
          {session.currentPageUrl && (
            <span className="text-xs text-gray-400 truncate max-w-xs">{session.currentPageUrl}</span>
          )}
        </div>
      )}

      {/* Error */}
      {(error ?? session.error) && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          {error ?? session.error}
        </div>
      )}

      {/* Pending action banner */}
      {session.hasPendingAction && session.status === "awaiting" && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg px-3 py-2 text-sm text-yellow-800">
          Waiting for content script to execute next action — is the OneSchool tab open with the extension active?
        </div>
      )}

      {/* Partial-capture warning — only shown when virtual grid data was truncated */}
      {session.hasPartialCapture && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg px-3 py-2 text-sm text-orange-800">
          Partial table capture — virtual grid rows may be incomplete. Scroll the grid fully or wait for auto-scroll to finish.
        </div>
      )}

      {/* Step history */}
      {session.steps.length > 0 && (
        <div className="flex flex-col gap-2 overflow-y-auto">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Steps</h2>
          {session.steps.map((step, i) => (
            <ActionCard key={step.id} step={step} index={i} />
          ))}
        </div>
      )}

      {session.status === "done" && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 font-medium">
          Task complete — {session.steps.length} step{session.steps.length !== 1 ? "s" : ""} executed.
        </div>
      )}
    </div>
  )
}
