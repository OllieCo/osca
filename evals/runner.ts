// Core eval runner — loads cases, calls inference, collects raw results.

import { readFile, readdir } from "node:fs/promises"
import { join, extname } from "node:path"
import { chatWithOllama } from "../server/src/lib/inference-client.js"
import { parseActionResponse } from "../server/src/lib/action-planner.js"
import { getPrompt } from "../server/src/prompts/index.js"
import { loadCases, type EvalCase } from "./schema.js"

const CASES_DIR = new URL("./cases/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")

export interface RunResult {
  caseId: string
  category: string
  source: string
  success: boolean          // all assertions passed
  pii_block_failed: boolean // any pii_block assertion failed
  output: Record<string, unknown> | null
  outputString: string
  assertionResults: AssertionResult[]
  error: string | null
  durationMs: number
}

export interface AssertionResult {
  type: string
  passed: boolean
  field?: string
  pattern?: string
  detail: string
  pii_block: boolean
}

export interface RunConfig {
  model: string
  temperature: number
  casesDir?: string
  categories?: string[]
}

export async function loadAllCases(dir = CASES_DIR): Promise<EvalCase[]> {
  const entries = await readdir(dir)
  const jsonFiles = entries.filter((f) => extname(f) === ".json")
  const all: EvalCase[] = []
  for (const file of jsonFiles) {
    const raw = await readFile(join(dir, file), "utf-8")
    const parsed = JSON.parse(raw) as unknown
    all.push(...loadCases(parsed))
  }
  return all
}

export async function runCase(ec: EvalCase, config: RunConfig): Promise<RunResult> {
  const start = Date.now()
  const systemPrompt = getPrompt("supervision")

  let output: Record<string, unknown> | null = null
  let outputString = ""
  let runError: string | null = null

  try {
    const userPrompt = buildPrompt(ec)
    const raw = await chatWithOllama(config.model, userPrompt, systemPrompt, 60_000, config.temperature)
    outputString = raw
    output = parseActionResponse(raw) as unknown as Record<string, unknown>
    outputString = JSON.stringify(output)
  } catch (err) {
    runError = (err as Error).message
  }

  const assertionResults = scoreAssertions(ec, output, outputString)
  const pii_block_failed = assertionResults.some((r) => r.pii_block && !r.passed)
  const success = runError === null && assertionResults.every((r) => r.passed)

  return {
    caseId: ec.id,
    category: ec.category,
    source: ec.source,
    success,
    pii_block_failed,
    output,
    outputString,
    assertionResults,
    error: runError,
    durationMs: Date.now() - start,
  }
}

function buildPrompt(ec: EvalCase): string {
  const { goal, pageState, rawPageText, steps } = ec.input

  const pageInfo = pageState
    ? [
        `URL: ${(pageState as Record<string, unknown>).url ?? "unknown"}`,
        `Fields: ${JSON.stringify((pageState as Record<string, unknown>).fields ?? [])}`,
        `Tables: ${JSON.stringify((pageState as Record<string, unknown>).tableData ?? [])}`,
      ].join("\n")
    : "No page data — use 'navigate' or 'scrape' to read the page first."

  const history =
    Array.isArray(steps) && steps.length > 0
      ? (steps as Array<{ status: string; action: { type: string; description: string }; result?: string }>)
          .map((s) => `[${s.status}] ${s.action.type}: ${s.action.description}${s.result ? ` → ${s.result}` : ""}`)
          .join("\n")
      : "No steps yet."

  const truncated =
    rawPageText.length > 3000 ? rawPageText.slice(0, 3000) + "\n[...truncated]" : rawPageText

  return `GOAL: ${goal}

CURRENT_PAGE:
${pageInfo}

RAW_PAGE_TEXT:
${truncated}

STEP_HISTORY:
${history}

Return the next single action as JSON.`
}

function getField(obj: Record<string, unknown> | null, path: string): string {
  if (path === "__output_string__") return ""  // handled by caller
  if (!obj) return ""
  const parts = path.split(".")
  let cur: unknown = obj
  for (const p of parts) {
    if (typeof cur !== "object" || cur === null) return ""
    cur = (cur as Record<string, unknown>)[p]
  }
  return typeof cur === "string" ? cur : JSON.stringify(cur ?? "")
}

function scoreAssertions(
  ec: EvalCase,
  output: Record<string, unknown> | null,
  outputString: string
): AssertionResult[] {
  return ec.assertions.map((a): AssertionResult => {
    if (a.type === "structural") {
      const missing = a.required_fields.filter((f) => output === null || !(f in output))
      const passed = missing.length === 0
      return {
        type: "structural",
        passed,
        detail: passed ? "All required fields present" : `Missing fields: ${missing.join(", ")}`,
        pii_block: false,
      }
    }

    if (a.type === "regex") {
      const raw = a.field === "__output_string__" ? outputString : getField(output, a.field)
      const re = new RegExp(a.pattern)
      const matches = re.test(raw)
      const passed = a.invert ? !matches : matches
      const pii_block = a.pii_block ?? false
      return {
        type: "regex",
        passed,
        field: a.field,
        pattern: a.pattern,
        detail: passed
          ? `OK (${a.invert ? "no match" : "matched"} /${a.pattern}/ in ${a.field})`
          : `FAIL: ${a.invert ? "unexpected match" : "no match"} /${a.pattern}/ in ${a.field}="${raw.slice(0, 80)}"`,
        pii_block,
      }
    }

    if (a.type === "llm-judge") {
      if (!a.enabled) {
        return { type: "llm-judge", passed: true, detail: "Skipped (disabled)", pii_block: false }
      }
      return { type: "llm-judge", passed: true, detail: "LLM-judge not implemented in runner v1", pii_block: false }
    }

    return { type: "unknown", passed: false, detail: "Unknown assertion type", pii_block: false }
  })
}
