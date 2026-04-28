// Plans the next agent action using the active inference backend.
// Backend selection (Ollama vs vLLM) is controlled by the `vllm-backend`
// feature flag — see server/src/lib/inference/factory.ts.
// Shared origin: MySchool action-planner.ts — n8n import replaced with inference-client.

import type { AgentAction, AgentStep, ScrapedRecord } from "../types/index.js"
import { getInferenceAdapter } from "./inference/factory.js"
import { config } from "./config.js"
import { getPrompt } from "../prompts/index.js"

export async function planNextAction(
  goal: string,
  currentPage: ScrapedRecord | null,
  steps: AgentStep[],
  rawPageText = ""
): Promise<AgentAction> {
  const adapter = await getInferenceAdapter()
  const prompt = buildPrompt(goal, currentPage, steps, rawPageText)
  const raw = await adapter.chat({
    model: config.OLLAMA_MODEL,
    prompt,
    systemPrompt: getPrompt("supervision"),
  })
  return parseActionResponse(raw)
}

function buildPrompt(
  goal: string,
  currentPage: ScrapedRecord | null,
  steps: AgentStep[],
  rawPageText: string
): string {
  const history = steps
    .map((s) => `[${s.status}] ${s.action.type}: ${s.action.description}${s.result ? ` → ${s.result}` : ""}`)
    .join("\n") || "No steps yet."

  const pageInfo = currentPage
    ? [
        `URL: ${currentPage.url}`,
        `Fields (tokenized): ${JSON.stringify(
          currentPage.fields.map((f) => ({ label: f.label, value: f.tokenizedValue })),
          null, 2
        )}`,
        `Tables: ${currentPage.tableData.length}`,
        currentPage.tableData.map((t, i) => `  Table ${i + 1}: ${t.headers.join(" | ")}`).join("\n"),
      ].join("\n")
    : "No page data — use 'navigate' or 'scrape' to read the page first."

  const truncated = rawPageText.length > 3000 ? rawPageText.slice(0, 3000) + "\n[...truncated]" : rawPageText

  return `GOAL: ${goal}

CURRENT_PAGE:
${pageInfo}

RAW_PAGE_TEXT:
${truncated}

STEP_HISTORY:
${history}

Return the next single action as JSON.`
}

function extractJson(raw: string): string | null {
  const start = raw.indexOf("{")
  if (start === -1) return null
  let depth = 0, inString = false, escape = false
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i]
    if (escape) { escape = false; continue }
    if (ch === "\\" && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === "{") depth++
    else if (ch === "}") { depth--; if (depth === 0) return raw.slice(start, i + 1) }
  }
  return null
}

export function parseActionResponse(raw: string): AgentAction {
  const jsonStr = extractJson(raw)
  if (!jsonStr) throw new Error(`No JSON in Ollama response: "${raw.slice(0, 400)}"`)

  let parsed: Partial<AgentAction>
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error(`Failed to parse action JSON: "${jsonStr.slice(0, 300)}"`)
  }

  if (!parsed.type) throw new Error(`Action missing "type": ${JSON.stringify(parsed)}`)
  if (!parsed.description) throw new Error(`Action missing "description": ${JSON.stringify(parsed)}`)

  return {
    type: parsed.type,
    selector: parsed.selector,
    target: parsed.target,
    value: parsed.value,
    description: parsed.description,
    reasoning: parsed.reasoning ?? "",
    risk: parsed.risk ?? "medium",
  }
}
