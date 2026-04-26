// Eval case schema — types, assertion kinds, and validator.

export type CaseSource = "synthetic" | "real" | "adversarial"
export type CaseCategory = "supervision" | "pii-guard" | "tone-safety" | "navigation" | "edge-case"
export type AssertionType = "regex" | "structural" | "llm-judge"
export type ActionType = "navigate" | "click" | "fill" | "select" | "check" | "drag" | "wait" | "scrape" | "done" | "error"
export type RiskLevel = "low" | "medium" | "high"

export interface RegexAssertion {
  type: "regex"
  field: string      // dot-path into the output object, e.g. "type" or "description"
  pattern: string    // regex string
  invert?: boolean   // if true, output must NOT match (used for PII leak checks)
  pii_block?: boolean // if true, failure is a hard release block (not a 5% threshold item)
}

export interface StructuralAssertion {
  type: "structural"
  required_fields: string[]              // top-level keys that must exist
  field_patterns?: Record<string, string> // field -> regex that value must satisfy
}

export interface LLMJudgeAssertion {
  type: "llm-judge"
  criteria: string   // natural-language criteria for the judge
  enabled: boolean   // must be false unless explicitly enabled; secondary check only
}

export type Assertion = RegexAssertion | StructuralAssertion | LLMJudgeAssertion

export interface EvalInput {
  goal: string
  pageState: Record<string, unknown> | null
  rawPageText: string
  steps: unknown[]
}

export interface EvalCaseMeta {
  created: string       // ISO date
  pii_checked: boolean  // must be true for source: real before commit
  reviewer: string | null
}

export interface EvalCase {
  id: string
  source: CaseSource
  category: CaseCategory
  description: string
  input: EvalInput
  assertions: Assertion[]
  metadata: EvalCaseMeta
}

export interface EvalCaseFile {
  cases: EvalCase[]
}

// Validate a parsed object is a well-formed EvalCase.
export function validateCase(obj: unknown): EvalCase {
  if (typeof obj !== "object" || obj === null) throw new Error("Case must be an object")
  const c = obj as Record<string, unknown>

  const requiredStrings = ["id", "source", "category", "description"] as const
  for (const k of requiredStrings) {
    if (typeof c[k] !== "string") throw new Error(`Case missing string field: ${k}`)
  }

  const validSources: CaseSource[] = ["synthetic", "real", "adversarial"]
  if (!validSources.includes(c.source as CaseSource)) {
    throw new Error(`Invalid source: ${c.source}. Must be one of ${validSources.join(", ")}`)
  }

  const validCategories: CaseCategory[] = ["supervision", "pii-guard", "tone-safety", "navigation", "edge-case"]
  if (!validCategories.includes(c.category as CaseCategory)) {
    throw new Error(`Invalid category: ${c.category}`)
  }

  if (typeof c.input !== "object" || c.input === null) throw new Error("Case missing input object")
  const input = c.input as Record<string, unknown>
  if (typeof input.goal !== "string") throw new Error("input.goal must be a string")
  if (typeof input.rawPageText !== "string") throw new Error("input.rawPageText must be a string")
  if (!Array.isArray(input.steps)) throw new Error("input.steps must be an array")

  if (!Array.isArray(c.assertions)) throw new Error("Case must have assertions array")
  for (const a of c.assertions as unknown[]) {
    validateAssertion(a)
  }

  const meta = c.metadata as Record<string, unknown>
  if (typeof meta?.pii_checked !== "boolean") throw new Error("metadata.pii_checked must be a boolean")
  if (c.source === "real" && !meta.pii_checked) {
    throw new Error(`Case ${c.id}: source=real but pii_checked=false — run PII check before committing`)
  }

  return obj as EvalCase
}

function validateAssertion(a: unknown): void {
  if (typeof a !== "object" || a === null) throw new Error("Assertion must be an object")
  const obj = a as Record<string, unknown>
  const validTypes: AssertionType[] = ["regex", "structural", "llm-judge"]
  if (!validTypes.includes(obj.type as AssertionType)) {
    throw new Error(`Invalid assertion type: ${obj.type}`)
  }
  if (obj.type === "regex") {
    if (typeof obj.field !== "string") throw new Error("regex assertion missing field")
    if (typeof obj.pattern !== "string") throw new Error("regex assertion missing pattern")
  }
  if (obj.type === "structural") {
    if (!Array.isArray(obj.required_fields)) throw new Error("structural assertion missing required_fields")
  }
}

// Load and validate all cases from a parsed JSON array.
export function loadCases(raw: unknown): EvalCase[] {
  if (!Array.isArray(raw)) throw new Error("Case file must be a JSON array")
  return raw.map((item, i) => {
    try {
      return validateCase(item)
    } catch (err) {
      throw new Error(`Case[${i}] validation error: ${(err as Error).message}`)
    }
  })
}
