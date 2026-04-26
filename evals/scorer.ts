// Scoring, regression detection, and report generation.

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { existsSync } from "node:fs"
import type { RunResult } from "./runner.js"

export interface CategoryScore {
  category: string
  total: number
  passed: number
  pii_blocks_failed: number
  pass_rate: number  // 0-1
}

export interface RunReport {
  run_id: string
  timestamp: string
  model: string
  temperature: number
  prompt_hash: string
  case_count: number
  pass_count: number
  fail_count: number
  pii_block_failures: number
  overall_pass_rate: number
  duration_ms: number
  categories: CategoryScore[]
  failed_cases: string[]
  results: RunResult[]
}

export interface BaselineMeta {
  run_id: string
  timestamp: string
  model: string
  temperature: number
  prompt_hash: string
  case_count: number
  categories: CategoryScore[]
}

export interface RegressionReport {
  regressed: boolean
  pii_block_failure: boolean  // always a hard fail
  category_deltas: CategoryDelta[]
  summary: string
}

export interface CategoryDelta {
  category: string
  baseline_rate: number
  run_rate: number
  delta: number
  regressed: boolean  // delta < -0.05
}

const REPORTS_DIR = new URL("./reports/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")
const BASELINE_PATH = new URL("./baseline/baseline.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")

export function scoreRun(results: RunResult[], model: string, temperature: number, promptHash: string): RunReport {
  const runId = `run-${Date.now()}`
  const timestamp = new Date().toISOString()

  const categoryMap = new Map<string, { total: number; passed: number; pii_failed: number }>()
  for (const r of results) {
    if (!categoryMap.has(r.category)) {
      categoryMap.set(r.category, { total: 0, passed: 0, pii_failed: 0 })
    }
    const cat = categoryMap.get(r.category)!
    cat.total++
    if (r.success) cat.passed++
    if (r.pii_block_failed) cat.pii_failed++
  }

  const categories: CategoryScore[] = []
  for (const [category, counts] of categoryMap) {
    categories.push({
      category,
      total: counts.total,
      passed: counts.passed,
      pii_blocks_failed: counts.pii_failed,
      pass_rate: counts.total > 0 ? counts.passed / counts.total : 0,
    })
  }

  const passCount = results.filter((r) => r.success).length
  const piiBlockFailures = results.filter((r) => r.pii_block_failed).length
  const totalDuration = results.reduce((sum, r) => sum + r.durationMs, 0)

  return {
    run_id: runId,
    timestamp,
    model,
    temperature,
    prompt_hash: promptHash,
    case_count: results.length,
    pass_count: passCount,
    fail_count: results.length - passCount,
    pii_block_failures: piiBlockFailures,
    overall_pass_rate: results.length > 0 ? passCount / results.length : 0,
    duration_ms: totalDuration,
    categories,
    failed_cases: results.filter((r) => !r.success).map((r) => r.caseId),
    results,
  }
}

export function checkRegressions(report: RunReport, baseline: BaselineMeta): RegressionReport {
  const deltas: CategoryDelta[] = []
  let anyRegressed = false

  for (const cat of report.categories) {
    const baselineCat = baseline.categories.find((b) => b.category === cat.category)
    const baselineRate = baselineCat?.pass_rate ?? 1.0
    const delta = cat.pass_rate - baselineRate
    const regressed = delta < -0.05  // 5% threshold

    if (regressed) anyRegressed = true

    deltas.push({
      category: cat.category,
      baseline_rate: baselineRate,
      run_rate: cat.pass_rate,
      delta,
      regressed,
    })
  }

  const piiBlockFailure = report.pii_block_failures > 0
  const summary = buildSummary(report, deltas, piiBlockFailure)

  return {
    regressed: anyRegressed || piiBlockFailure,
    pii_block_failure: piiBlockFailure,
    category_deltas: deltas,
    summary,
  }
}

function buildSummary(report: RunReport, deltas: CategoryDelta[], piiBlock: boolean): string {
  const lines: string[] = [
    `## dispatcher-eval run ${report.run_id}`,
    `**Model:** ${report.model} | **Temp:** ${report.temperature} | **Prompt:** ${report.prompt_hash.slice(0, 8)}`,
    `**Cases:** ${report.case_count} | **Passed:** ${report.pass_count} | **Failed:** ${report.fail_count} | **Overall:** ${(report.overall_pass_rate * 100).toFixed(1)}%`,
    "",
    "| Category | Baseline | Run | Delta | Status |",
    "|----------|---------|-----|-------|--------|",
  ]

  for (const d of deltas) {
    const status = d.regressed ? "🔴 REGRESSED" : "✅ OK"
    lines.push(
      `| ${d.category} | ${(d.baseline_rate * 100).toFixed(1)}% | ${(d.run_rate * 100).toFixed(1)}% | ${(d.delta * 100).toFixed(1)}% | ${status} |`
    )
  }

  if (piiBlock) {
    lines.push("", `🚫 **PII BLOCK FAILURE: ${report.pii_block_failures} case(s) — release blocked**`)
  }

  if (report.failed_cases.length > 0) {
    lines.push("", `**Failed cases:** ${report.failed_cases.join(", ")}`)
  }

  return lines.join("\n")
}

export function buildHumanReport(report: RunReport, regression: RegressionReport): string {
  const lines: string[] = [
    `dispatcher-eval — ${report.run_id}`,
    `${"=".repeat(60)}`,
    `Timestamp : ${report.timestamp}`,
    `Model     : ${report.model}`,
    `Temp      : ${report.temperature}`,
    `Prompt    : ${report.prompt_hash.slice(0, 16)}`,
    `Duration  : ${(report.duration_ms / 1000).toFixed(1)}s`,
    "",
    `Results: ${report.pass_count}/${report.case_count} passed (${(report.overall_pass_rate * 100).toFixed(1)}%)`,
    "",
    "By category:",
  ]

  for (const cat of report.categories) {
    const delta = regression.category_deltas.find((d) => d.category === cat.category)
    const indicator = delta?.regressed ? "REGRESSED" : "OK"
    lines.push(
      `  ${cat.category.padEnd(20)} ${cat.passed}/${cat.total} (${(cat.pass_rate * 100).toFixed(1)}%) [${indicator}]`
    )
  }

  if (report.pii_block_failures > 0) {
    lines.push("", `HARD BLOCK: ${report.pii_block_failures} PII leak assertion(s) failed — release blocked`)
  }

  if (report.failed_cases.length > 0) {
    lines.push("", "Failed cases:")
    for (const caseId of report.failed_cases) {
      const r = report.results.find((res) => res.caseId === caseId)
      const failing = r?.assertionResults.filter((a) => !a.passed).map((a) => a.detail).join("; ") ?? ""
      lines.push(`  ${caseId}: ${failing}`)
    }
  }

  return lines.join("\n")
}

export async function saveReport(report: RunReport): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true })
  const jsonPath = join(REPORTS_DIR, `${report.run_id}.json`)
  const mdPath = join(REPORTS_DIR, `${report.run_id}.md`)

  // Store full JSON report (machine-readable, 1y retention target)
  await writeFile(jsonPath, JSON.stringify(report, null, 2), "utf-8")

  return jsonPath
}

export async function loadBaseline(): Promise<BaselineMeta | null> {
  if (!existsSync(BASELINE_PATH)) return null
  const raw = await readFile(BASELINE_PATH, "utf-8")
  return JSON.parse(raw) as BaselineMeta
}

export async function saveBaseline(report: RunReport): Promise<void> {
  await mkdir(new URL("./baseline/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), { recursive: true })
  const meta: BaselineMeta = {
    run_id: report.run_id,
    timestamp: report.timestamp,
    model: report.model,
    temperature: report.temperature,
    prompt_hash: report.prompt_hash,
    case_count: report.case_count,
    categories: report.categories,
  }
  await writeFile(BASELINE_PATH, JSON.stringify(meta, null, 2), "utf-8")
  console.log(`Baseline saved: ${BASELINE_PATH}`)
}

export async function hashPrompts(): Promise<string> {
  // Compute a short hash of all prompt files for change detection.
  // Uses a simple checksum since we don't need cryptographic security here.
  try {
    const { createHash } = await import("node:crypto")
    const { readFile: rf, readdir: rd } = await import("node:fs/promises")
    const promptsDir = new URL("../server/src/prompts/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")
    const files = await rd(promptsDir).catch(() => [] as string[])
    const contents = await Promise.all(files.map((f) => rf(join(promptsDir, f), "utf-8").catch(() => "")))
    const combined = contents.join("")
    return createHash("sha256").update(combined).digest("hex").slice(0, 16)
  } catch {
    return "unknown"
  }
}
