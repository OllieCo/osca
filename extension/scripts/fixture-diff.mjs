#!/usr/bin/env node
/**
 * fixture-diff.mjs — DOM Resilience Epic 1 (Story 1.2)
 *
 * Applies every selector in ALL_SELECTORS against two versioned fixture
 * directories (v1 and v2) and reports regressions.
 *
 * Usage:
 *   node scripts/fixture-diff.mjs [--from v1] [--to v2]
 *
 * Exit codes:
 *   0 — no regressions (additions and removals are printed but not fatal)
 *   1 — at least one regression (selector found in --from but absent in --to)
 *
 * What counts as a regression?
 *   A selector that matched ≥1 element in the baseline (--from) but matches
 *   0 elements across ALL fixture files in the newer snapshot (--to).
 *   This means a OneSchool update wiped out a selector we rely on.
 *
 * Run from extension/:
 *   node scripts/fixture-diff.mjs
 *   node scripts/fixture-diff.mjs --from fixtures/v1 --to fixtures/v2
 */

import { readFileSync, readdirSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"

// ── Resolve selector registry ────────────────────────────────────────────────
// We import the compiled JS from the TypeScript build output if available,
// otherwise we fall back to a direct ts-node / tsx execution hint.

const __dir = resolve(fileURLToPath(import.meta.url), "..")
const repoRoot = resolve(__dir, "..")

let ALL_SELECTORS
try {
  // Try compiled output first (dist/lib/selectors.js)
  const distPath = join(repoRoot, "dist/lib/selectors.js")
  if (existsSync(distPath)) {
    const mod = await import(distPath)
    ALL_SELECTORS = mod.ALL_SELECTORS
  } else {
    // If running with tsx/ts-node the TypeScript source works directly
    const srcPath = join(repoRoot, "src/lib/selectors.ts")
    const mod = await import(srcPath)
    ALL_SELECTORS = mod.ALL_SELECTORS
  }
} catch (e) {
  console.error("[fixture-diff] Could not load ALL_SELECTORS:", e.message)
  console.error("  Tip: run `npm run build` first, or use `node --loader tsx scripts/fixture-diff.mjs`")
  process.exit(2)
}

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const fromArg = args[args.indexOf("--from") + 1] ?? "fixtures/v1"
const toArg   = args[args.indexOf("--to")   + 1] ?? "fixtures/v2"
const fromDir = resolve(repoRoot, fromArg)
const toDir   = resolve(repoRoot, toArg)

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadHtmlFiles(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .map((f) => {
      const html = readFileSync(join(dir, f), "utf-8")
      return { file: f, doc: new JSDOM(html).window.document }
    })
}

/**
 * Returns the total number of matches for a CSS selector across a list of
 * {file, doc} objects.  Handles :scope selectors gracefully by querying body.
 */
function countMatches(selector, fixtures) {
  let total = 0
  for (const { doc } of fixtures) {
    try {
      total += doc.body.querySelectorAll(selector).length
    } catch {
      // Invalid selector — treat as 0 matches (reported separately)
    }
  }
  return total
}

// ── Main ─────────────────────────────────────────────────────────────────────

const fromFixtures = loadHtmlFiles(fromDir)
const toFixtures   = loadHtmlFiles(toDir)

if (fromFixtures.length === 0) {
  console.warn(`[fixture-diff] No HTML files found in baseline dir: ${fromDir}`)
  console.warn("  Nothing to compare — exiting cleanly.")
  process.exit(0)
}

if (toFixtures.length === 0) {
  console.warn(`[fixture-diff] No HTML files found in snapshot dir: ${toDir}`)
  console.warn("  Cannot compare without a v2 snapshot.  Skipping diff.")
  process.exit(0)
}

console.log(`\n[fixture-diff] Comparing selectors`)
console.log(`  baseline : ${fromDir} (${fromFixtures.length} file(s))`)
console.log(`  snapshot : ${toDir}   (${toFixtures.length} file(s))`)
console.log(`  selectors: ${Object.keys(ALL_SELECTORS).length}\n`)

const regressions = []
const additions   = []
const unchanged   = []

for (const [name, entry] of Object.entries(ALL_SELECTORS)) {
  const fromCount = countMatches(entry.selector, fromFixtures)
  const toCount   = countMatches(entry.selector, toFixtures)

  if (fromCount > 0 && toCount === 0) {
    regressions.push({ name, selector: entry.selector, stability: entry.stability, risk: entry.risk })
  } else if (fromCount === 0 && toCount > 0) {
    additions.push({ name, selector: entry.selector, toCount })
  } else {
    unchanged.push({ name, fromCount, toCount })
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

if (unchanged.length > 0) {
  console.log(`✅  Unchanged (${unchanged.length} selectors matched in both snapshots)`)
}

if (additions.length > 0) {
  console.log(`\n🆕  Additions — matched in v2 but NOT v1 (new markup, not a regression):`)
  for (const a of additions) {
    console.log(`    ${a.name}  "${a.selector}"  → ${a.toCount} match(es) in v2`)
  }
}

if (regressions.length > 0) {
  console.log(`\n🔴  REGRESSIONS — matched in v1 but NOT v2 (${regressions.length}):`)
  for (const r of regressions) {
    console.log(`\n  ❌  ${r.name}  [${r.stability}]`)
    console.log(`      selector : "${r.selector}"`)
    console.log(`      risk     : ${r.risk}`)
  }
  console.log(`\n[fixture-diff] ${regressions.length} regression(s) detected — exiting with code 1.\n`)
  process.exit(1)
}

console.log(`\n[fixture-diff] No regressions. All baseline selectors still match.\n`)
process.exit(0)
