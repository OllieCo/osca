// Shared types for Dispatcher server
// Shared origin: MySchool extension — adapted for Node.js context

export type Classification =
  | "OFFICIAL"
  | "OFFICIAL:Sensitive"
  | "CONFIDENTIAL"
  | "RESTRICTED"

export type FieldType =
  | "name" | "email" | "phone" | "dob" | "address"
  | "id" | "qsn" | "staffid" | "abn" | "tfn" | "unknown"

export interface ScrapedField {
  label: string
  rawValue: string
  tokenizedValue: string
  fieldType: FieldType
}

export interface PageInfo {
  currentStart: number
  currentEnd: number
  total: number
  hasMore: boolean
}

export interface TableMeta {
  source: "kendo" | "html"
  isVirtual: boolean
  gridId?: string
  pageInfo?: PageInfo
}

export interface ScrapedTable {
  headers: string[]
  rows: string[][]
  meta: TableMeta
}

export interface ScrapedRecord {
  url: string
  timestamp: number
  classification: Classification
  fields: Omit<ScrapedField, "rawValue">[]  // rawValue never reaches server
  tableData: ScrapedTable[]
}

export type TokenMap = Record<string, string>

export type ActionType =
  | "navigate" | "click" | "fill" | "select" | "check"
  | "drag" | "wait" | "scrape" | "done" | "error"

export type RiskLevel = "low" | "medium" | "high"

export interface AgentAction {
  id?: string
  type: ActionType
  selector?: string
  target?: string
  value?: string
  description: string
  reasoning: string
  risk: RiskLevel
}

export type AgentStepStatus =
  | "pending" | "confirmed" | "rejected" | "executing" | "done" | "failed"

export interface AgentStep {
  id: string
  action: AgentAction
  status: AgentStepStatus
  result?: string
  timestamp: number
}

export type AgentStatus =
  | "idle" | "planning" | "awaiting" | "executing" | "done" | "failed" | "cancelled"

export interface AgentSession {
  id: string
  goal: string
  status: AgentStatus
  steps: AgentStep[]
  currentPage: ScrapedRecord | null
  pendingAction: AgentAction | null
  startedAt: number
  error?: string
}
