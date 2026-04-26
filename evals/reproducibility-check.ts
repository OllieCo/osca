#!/usr/bin/env tsx
// Reproducibility check — runs two consecutive evals and compares pass rates.
//
// Per AC 4.3.2: two consecutive runs against the same baseline must produce
// comparable results within tolerance (default ±5%). Detects model nondeterminism
// at temperature=0.
//
// Usage:
//   tsx evals/reproducibility-check.ts [--model <name>] [--tolerance <float>]

import { parseArgs } from "node:util"
import { loadAllCases, runCase, type RunConfig } from "./runner.js"
import { scoreRun, hashPrompts } from "./scorer.js"
import { pingOllama } from "../server/src/lib/inference-client.js"

const { values: args } = parseArgs({
  options: {
    model:     { type: "string",  default: "gemma4:12b" },
    tolerance: { type: "string",  default: "0.05" },
    categories: { type: "string" },
  },
  strict: false,
})

const model     = args.model as string
const tolerance = parseFloat(args.tolerance as string)
const categories = (args.categories as string | undefined)?.split(",").map((s) => s.trim())

async function main() {
  console.log(`dispatcher-eval reproducibility check`)
  console.log(`  Model     : ${model}`)
  console.log(`  Temp      : 0 (pinned)`)
  console.log(`  Tolerance : ±${(tolerance * 100).toFixed(0)}%`)
  console.log("")

  const ollamaUp = await pingOllama()
  if (!ollamaUp) {
    console.error("ERROR: Ollama not reachable")
    process.exit(1)
  }

  let cases = await loadAllCases()
  if (categories && categories.length > 0) {
    cases = cases.filter((c) => categories.includes(c.category))
  }

  const config: RunConfig = { model, temperature: 0 }
  const promptHash = await hashPrompts()

  console.log(`Running pass 1 (${cases.length} cases)...`)
  const results1 = await Promise.all(cases.map((c) => runCase(c, config)))
  const report1 = scoreRun(results1, model, 0, promptHash)

  console.log(`Running pass 2 (${cases.length} cases)...`)
  const results2 = await Promise.all(cases.map((c) => runCase(c, config)))
  const report2 = scoreRun(results2, model, 0, promptHash)

  console.log("")
  console.log("| Category | Pass 1 | Pass 2 | Delta | Status |")
  console.log("|----------|--------|--------|-------|--------|")

  let anyFailed = false
  const allCategories = new Set([
    ...report1.categories.map((c) => c.category),
    ...report2.categories.map((c) => c.category),
  ])

  for (const cat of allCategories) {
    const r1 = report1.categories.find((c) => c.category === cat)?.pass_rate ?? 0
    const r2 = report2.categories.find((c) => c.category === cat)?.pass_rate ?? 0
    const delta = Math.abs(r1 - r2)
    const ok = delta <= tolerance
    if (!ok) anyFailed = true
    const status = ok ? "✅ OK" : `❌ DRIFT >${(tolerance * 100).toFixed(0)}%`
    console.log(`| ${cat.padEnd(20)} | ${(r1 * 100).toFixed(1)}% | ${(r2 * 100).toFixed(1)}% | ${(delta * 100).toFixed(1)}% | ${status} |`)
  }

  console.log("")
  console.log(`Model: ${model} | Temp: 0 | Prompt: ${promptHash.slice(0, 8)}`)

  if (anyFailed) {
    console.error("Reproducibility check FAILED — drift exceeds tolerance.")
    console.error("Investigate model nondeterminism before re-baselining.")
    process.exit(1)
  }

  console.log("Reproducibility check PASSED — runs are within tolerance.")
}

main().catch((err) => {
  console.error("Fatal:", err)
  process.exit(1)
})
