#!/usr/bin/env tsx
// dispatcher-eval — golden-set regression runner.
//
// Usage:
//   tsx evals/dispatcher-eval.ts [options]
//
// Options:
//   --model <name>          Ollama model name (default: gemma4:12b)
//   --temperature <float>   Model temperature (default: 0)
//   --cases <dir>           Path to cases directory (default: evals/cases/)
//   --output <dir>          Report output directory (default: evals/reports/)
//   --baseline              Capture this run as the new baseline
//   --categories <list>     Comma-separated categories to run (default: all)
//   --ci                    Exit non-zero if any regression or PII block failure

import { parseArgs } from "node:util"
import { loadAllCases, runCase, type RunConfig } from "./runner.js"
import { scoreRun, checkRegressions, buildHumanReport, saveReport, loadBaseline, saveBaseline, hashPrompts } from "./scorer.js"
import { pingOllama } from "../server/src/lib/inference-client.js"

const { values: args } = parseArgs({
  options: {
    model:       { type: "string",  default: "gemma4:12b" },
    temperature: { type: "string",  default: "0" },
    cases:       { type: "string" },
    output:      { type: "string" },
    baseline:    { type: "boolean", default: false },
    categories:  { type: "string" },
    ci:          { type: "boolean", default: false },
  },
  strict: false,
})

const model       = args.model as string
const temperature = parseFloat(args.temperature as string)
const categories  = (args.categories as string | undefined)?.split(",").map((s) => s.trim())
const captureBaseline = args.baseline as boolean
const ciMode      = args.ci as boolean

async function main() {
  console.log(`dispatcher-eval starting`)
  console.log(`  Model       : ${model}`)
  console.log(`  Temperature : ${temperature}`)
  console.log(`  Categories  : ${categories?.join(", ") ?? "all"}`)
  console.log(`  Baseline    : ${captureBaseline ? "capture" : "compare"}`)
  console.log("")

  // Verify Ollama is reachable
  const ollamaUp = await pingOllama()
  if (!ollamaUp) {
    console.error("ERROR: Ollama not reachable at http://localhost:11434")
    console.error("Start Ollama before running evals: ollama serve")
    process.exit(1)
  }

  // Load cases
  let cases = await loadAllCases(args.cases as string | undefined)
  if (categories && categories.length > 0) {
    cases = cases.filter((c) => categories.includes(c.category))
  }
  console.log(`Loaded ${cases.length} cases`)

  const config: RunConfig = { model, temperature }
  const promptHash = await hashPrompts()
  console.log(`Prompt hash : ${promptHash.slice(0, 8)}`)
  console.log("")

  // Run cases
  const results = []
  let i = 0
  for (const ec of cases) {
    i++
    process.stdout.write(`[${i}/${cases.length}] ${ec.id.padEnd(20)} `)
    const result = await runCase(ec, config)
    const mark = result.pii_block_failed ? "🚫" : result.success ? "✅" : "❌"
    process.stdout.write(`${mark} ${result.durationMs}ms\n`)
    if (!result.success && result.error) {
      console.log(`         error: ${result.error.slice(0, 120)}`)
    }
    results.push(result)
  }

  console.log("")

  // Score and report
  const report = scoreRun(results, model, temperature, promptHash)
  const jsonPath = await saveReport(report)

  const baseline = await loadBaseline()

  if (captureBaseline) {
    await saveBaseline(report)
    console.log("Baseline captured.")
  }

  const regression = checkRegressions(
    report,
    baseline ?? {
      run_id: "none",
      timestamp: "",
      model,
      temperature,
      prompt_hash: promptHash,
      case_count: 0,
      categories: [],
    }
  )

  const humanReport = buildHumanReport(report, regression)
  console.log(humanReport)
  console.log("")
  console.log(`JSON report: ${jsonPath}`)

  // CI mode: non-zero exit on regression or PII block
  if (ciMode) {
    if (regression.pii_block_failure) {
      console.error("CI FAIL: PII block assertion(s) failed — release blocked")
      process.exit(2)
    }
    if (regression.regressed) {
      console.error("CI FAIL: Category regression(s) detected (≥5% drop)")
      process.exit(1)
    }
    console.log("CI PASS")
  }
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
