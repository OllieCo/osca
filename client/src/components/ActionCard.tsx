import type { AgentStep } from "../types/index"

const RISK_BADGE: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-red-100 text-red-700",
}

const STATUS_DOT: Record<string, string> = {
  pending: "bg-gray-400",
  confirmed: "bg-blue-400",
  executing: "bg-yellow-400 animate-pulse",
  done: "bg-green-500",
  failed: "bg-red-500",
  rejected: "bg-gray-300",
}

interface Props { step: AgentStep; index: number }

export default function ActionCard({ step, index }: Props) {
  const { action, status, result } = step

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white text-sm">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status] ?? "bg-gray-300"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-gray-400">#{index + 1}</span>
            <span className="font-medium text-gray-800">{action.description}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${RISK_BADGE[action.risk] ?? ""}`}>
              {action.risk}
            </span>
          </div>
          {action.reasoning && (
            <p className="mt-1 text-xs text-gray-500 italic">{action.reasoning}</p>
          )}
          {result && (
            <p className={`mt-1 text-xs ${status === "failed" ? "text-red-600" : "text-gray-600"}`}>
              → {result}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
