export type FieldType = "name" | "email" | "phone" | "dob" | "address" | "id" | "qsn" | "staffid" | "abn" | "tfn" | "unknown"
export type Classification = "OFFICIAL" | "OFFICIAL:Sensitive" | "CONFIDENTIAL" | "RESTRICTED"
export type ActionType = "navigate" | "click" | "fill" | "select" | "check" | "drag" | "wait" | "scrape" | "done" | "error"
export type RiskLevel = "low" | "medium" | "high"
export type TokenMap = Record<string, string>

export interface ScrapedField { label: string; rawValue: string; tokenizedValue: string; fieldType: FieldType }
export interface PageInfo { currentStart: number; currentEnd: number; total: number; hasMore: boolean }
export interface TableMeta { source: "kendo" | "html"; isVirtual: boolean; gridId?: string; pageInfo?: PageInfo }
export interface ScrapedTable { headers: string[]; rows: string[][]; meta: TableMeta }
export interface ScrapedRecord { url: string; timestamp: number; classification: Classification; fields: Omit<ScrapedField, "rawValue">[]; tableData: ScrapedTable[] }
export interface AgentAction { id?: string; type: ActionType; selector?: string; target?: string; value?: string; description: string; reasoning: string; risk: RiskLevel }
