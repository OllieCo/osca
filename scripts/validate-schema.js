#!/usr/bin/env node
// Validates that contracts/schema-version matches SCHEMA_VERSION in server source.
// Run: node scripts/validate-schema.js
// CI: added as a step in build.yml server job.

import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, "..")

// ── Read the contract schema version ───────────────────────────────────────
const contractVersionFile = resolve(root, "contracts", "schema-version")
if (!existsSync(contractVersionFile)) {
  console.error("ERROR: contracts/schema-version not found")
  process.exit(1)
}
const contractVersion = readFileSync(contractVersionFile, "utf8").trim()

// ── Read SCHEMA_VERSION from server source ─────────────────────────────────
// Expected location: server/src/types/index.ts
// Expected pattern:  export const SCHEMA_VERSION = "x.y.z"
const typesFile = resolve(root, "server", "src", "types", "index.ts")

if (!existsSync(typesFile)) {
  // SCHEMA_VERSION not yet introduced — skip validation but warn.
  // This is expected until the Data Migration & Schema Versioning project lands.
  console.warn(
    `WARN: ${typesFile} not found — SCHEMA_VERSION not yet defined. Skipping parity check.`
  )
  console.log(`Contract schema version: ${contractVersion}`)
  process.exit(0)
}

const typesSource = readFileSync(typesFile, "utf8")
const match = typesSource.match(/export\s+const\s+SCHEMA_VERSION\s*=\s*["']([^"']+)["']/)

if (!match) {
  console.warn("WARN: SCHEMA_VERSION constant not found in server/src/types/index.ts — skipping parity check.")
  process.exit(0)
}

const serverVersion = match[1]

if (contractVersion !== serverVersion) {
  console.error(
    `ERROR: Schema version mismatch\n` +
    `  contracts/schema-version: ${contractVersion}\n` +
    `  server SCHEMA_VERSION:    ${serverVersion}\n\n` +
    `Update contracts/schema-version to match, or bump SCHEMA_VERSION in server/src/types/index.ts.`
  )
  process.exit(1)
}

console.log(`Schema version parity OK: ${contractVersion}`)
