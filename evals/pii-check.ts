#!/usr/bin/env tsx
// Pre-commit PII check for eval case files.
//
// Runs automatically via git pre-commit hook. Blocks commit if any case
// with source=real has pii_checked=false, or if raw PII patterns are
// found inside case files that should be tokenized/synthetic.
//
// Usage (called by .git/hooks/pre-commit):
//   tsx evals/pii-check.ts [staged-files...]
//
// Exit 0 = clean, exit 1 = PII violation found.

import { readFile } from "node:fs/promises"
import { containsPII } from "../server/src/lib/scrubber.js"
import { loadCases, type EvalCase } from "./schema.js"

const stagedFiles = process.argv.slice(2).filter((f) => f.includes("evals/cases/") && f.endsWith(".json"))

async function checkFile(filePath: string): Promise<string[]> {
  const violations: string[] = []
  let raw: string
  try {
    raw = await readFile(filePath, "utf-8")
  } catch {
    return [`Cannot read ${filePath}`]
  }

  // 1. Schema validation
  let cases: EvalCase[]
  try {
    const parsed = JSON.parse(raw) as unknown
    cases = loadCases(parsed)
  } catch (err) {
    return [`Schema validation failed in ${filePath}: ${(err as Error).message}`]
  }

  // 2. Check each case
  for (const ec of cases) {
    // Real-source cases must have pii_checked=true before commit
    if (ec.source === "real" && !ec.metadata.pii_checked) {
      violations.push(`[${ec.id}] source=real but pii_checked=false — run PII shield before committing`)
    }

    // Real-source cases must have a reviewer recorded
    if (ec.source === "real" && !ec.metadata.reviewer) {
      violations.push(`[${ec.id}] source=real but reviewer is null — add reviewer sign-off in PR`)
    }

    // Scan all string fields in the input for PII that was not tokenized
    const inputStr = JSON.stringify(ec.input)

    // Adversarial and synthetic cases may contain PII-like patterns intentionally —
    // but only within the rawPageText/goal fields as test vectors. Skip deep scanning
    // for these; the pii_checked flag is only mandatory for real-source cases.
    if (ec.source === "real") {
      if (containsPII(ec.input.goal)) {
        violations.push(`[${ec.id}] PII detected in input.goal — tokenize before committing`)
      }
      if (containsPII(ec.input.rawPageText)) {
        violations.push(`[${ec.id}] PII detected in input.rawPageText — tokenize before committing`)
      }
      if (containsPII(inputStr)) {
        violations.push(`[${ec.id}] PII detected in input fields — tokenize all PII before committing`)
      }
    }
  }

  return violations
}

async function main() {
  if (stagedFiles.length === 0) {
    // No case files staged — nothing to check
    process.exit(0)
  }

  console.log(`dispatcher-eval pii-check: scanning ${stagedFiles.length} case file(s)...`)

  const allViolations: string[] = []
  for (const file of stagedFiles) {
    const violations = await checkFile(file)
    if (violations.length > 0) {
      console.error(`\n${file}:`)
      for (const v of violations) {
        console.error(`  ❌ ${v}`)
      }
      allViolations.push(...violations)
    }
  }

  if (allViolations.length > 0) {
    console.error(`\nCommit blocked: ${allViolations.length} PII violation(s) found.`)
    console.error("Resolve all violations before committing eval cases.")
    process.exit(1)
  }

  console.log("✅ PII check passed — all staged case files clean")
  process.exit(0)
}

main().catch((err) => {
  console.error("pii-check fatal:", err)
  process.exit(1)
})
