#!/usr/bin/env tsx
// Installs the PII pre-commit hook into .git/hooks/pre-commit.
// Run once after cloning: tsx evals/install-hooks.ts

import { writeFile, chmod } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"

const repoRoot = new URL("../", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")
const hooksDir = join(repoRoot, ".git", "hooks")
const hookPath = join(hooksDir, "pre-commit")

const hookScript = `#!/bin/sh
# dispatcher-eval PII pre-commit hook
# Validates staged eval case files for PII violations and schema errors.

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep "evals/cases/.*\\.json$" | tr '\\n' ' ')

if [ -z "$STAGED" ]; then
  exit 0
fi

echo "Running dispatcher-eval pii-check on staged case files..."
npx tsx evals/pii-check.ts $STAGED
exit $?
`

async function main() {
  if (!existsSync(hooksDir)) {
    console.error("Not inside a git repository (no .git/hooks found). Run from repo root.")
    process.exit(1)
  }

  await writeFile(hookPath, hookScript, "utf-8")
  try {
    await chmod(hookPath, 0o755)
  } catch {
    console.warn("Could not chmod hook (Windows — run from Git Bash or WSL if needed)")
  }

  console.log(`✅ Pre-commit hook installed: ${hookPath}`)
  console.log("Hook will check evals/cases/*.json files on every commit.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
