#!/usr/bin/env tsx
// Quarterly PII audit — scans all committed case files for PII regressions.
//
// Run quarterly (or after a PII shield update) to catch cases that
// may have slipped through the pre-commit hook or whose PII patterns
// were added to the scrubber after initial commit.
//
// Usage:
//   tsx evals/audit.ts
//
// Exit 0 = clean, exit 1 = violations found.

import { readFile, readdir, writeFile } from "node:fs/promises"
import { join, extname } from "node:path"
import { containsPII } from "../server/src/lib/scrubber.js"
import { loadCases } from "./schema.js"

const CASES_DIR = new URL("./cases/", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")
const AUDIT_LOG  = new URL("./audit-log.json", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")

interface AuditEntry {
  timestamp: string
  total_cases: number
  violations: Array<{ caseId: string; file: string; issue: string }>
  clean: boolean
}

async function main() {
  console.log(`dispatcher-eval quarterly PII audit — ${new Date().toISOString()}`)
  console.log(`Scanning: ${CASES_DIR}`)
  console.log("")

  const entries = await readdir(CASES_DIR)
  const jsonFiles = entries.filter((f) => extname(f) === ".json")

  const violations: AuditEntry["violations"] = []
  let totalCases = 0

  for (const file of jsonFiles) {
    const filePath = join(CASES_DIR, file)
    const raw = await readFile(filePath, "utf-8")
    let cases
    try {
      cases = loadCases(JSON.parse(raw))
    } catch (err) {
      console.error(`Schema error in ${file}: ${(err as Error).message}`)
      violations.push({ caseId: "schema", file, issue: (err as Error).message })
      continue
    }

    for (const ec of cases) {
      totalCases++

      // Re-check real-source cases against the current PII shield
      if (ec.source === "real") {
        const fields = [
          { name: "goal",        value: ec.input.goal },
          { name: "rawPageText", value: ec.input.rawPageText },
        ]
        for (const { name, value } of fields) {
          if (containsPII(value)) {
            const issue = `PII detected in input.${name} — scrubber updated since initial commit`
            violations.push({ caseId: ec.id, file, issue })
            console.error(`❌ ${ec.id} (${file}): ${issue}`)
          }
        }

        // Verify pii_checked is still true and reviewer exists
        if (!ec.metadata.pii_checked) {
          const issue = "pii_checked=false on real-source case"
          violations.push({ caseId: ec.id, file, issue })
          console.error(`❌ ${ec.id} (${file}): ${issue}`)
        }
        if (!ec.metadata.reviewer) {
          const issue = "reviewer=null on real-source case"
          violations.push({ caseId: ec.id, file, issue })
          console.error(`❌ ${ec.id} (${file}): ${issue}`)
        }
      }
    }
  }

  const entry: AuditEntry = {
    timestamp: new Date().toISOString(),
    total_cases: totalCases,
    violations,
    clean: violations.length === 0,
  }

  // Append to audit log
  let existingLog: AuditEntry[] = []
  try {
    existingLog = JSON.parse(await readFile(AUDIT_LOG, "utf-8")) as AuditEntry[]
  } catch {
    // First run — start fresh
  }
  existingLog.push(entry)
  await writeFile(AUDIT_LOG, JSON.stringify(existingLog, null, 2), "utf-8")

  if (violations.length > 0) {
    console.error(`\nAudit FAILED: ${violations.length} violation(s) found across ${totalCases} cases.`)
    console.error(`Review and remediate before next release. Audit log: ${AUDIT_LOG}`)
    process.exit(1)
  }

  console.log(`✅ Audit passed — ${totalCases} cases clean. Log: ${AUDIT_LOG}`)
}

main().catch((err) => {
  console.error("Audit fatal:", err)
  process.exit(1)
})
