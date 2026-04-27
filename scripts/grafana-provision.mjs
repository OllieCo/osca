#!/usr/bin/env node
/**
 * grafana-provision.mjs — idempotent Grafana Cloud provisioning script
 *
 * Imports dashboards and alert rules into your Grafana Cloud stack via the
 * Grafana HTTP API. Safe to re-run — dashboards are upserted by UID.
 *
 * Usage:
 *   GRAFANA_STACK_URL=https://ollieco.grafana.net \
 *   GRAFANA_API_TOKEN=glsa_... \
 *   node scripts/grafana-provision.mjs
 *
 * GRAFANA_STACK_URL  — your Grafana stack URL (not the OTLP gateway URL)
 * GRAFANA_API_TOKEN  — a Grafana Cloud API token with Admin role
 *                      Create at: your-stack.grafana.net → Administration →
 *                      Service accounts → Add service account → Admin role →
 *                      Add service account token
 *
 * Note: GRAFANA_API_TOKEN is DIFFERENT from GRAFANA_OTLP_TOKEN.
 * The OTLP token is for metric/trace ingestion only. This script needs an
 * API token with dashboard + alerting admin permissions.
 */

import { readFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parse as parseYaml } from "https://deno.land/std@0.224.0/yaml/mod.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const STACK_URL = process.env.GRAFANA_STACK_URL?.replace(/\/$/, "")
const API_TOKEN = process.env.GRAFANA_API_TOKEN

if (!STACK_URL || !API_TOKEN) {
  console.error("ERROR: GRAFANA_STACK_URL and GRAFANA_API_TOKEN must be set")
  console.error("  export GRAFANA_STACK_URL=https://your-stack.grafana.net")
  console.error("  export GRAFANA_API_TOKEN=glsa_...")
  process.exit(1)
}

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${API_TOKEN}`,
}

async function apiCall(method, path, body) {
  const url = `${STACK_URL}${path}`
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${method} ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

// ── Ensure folder exists ───────────────────────────────────────────────────

async function ensureFolder(title) {
  // Check if folder already exists
  const folders = await apiCall("GET", "/api/folders")
  const existing = folders.find((f) => f.title === title)
  if (existing) {
    console.log(`  Folder '${title}' already exists (uid: ${existing.uid})`)
    return existing.uid
  }
  const created = await apiCall("POST", "/api/folders", { title })
  console.log(`  Created folder '${title}' (uid: ${created.uid})`)
  return created.uid
}

// ── Import dashboards ──────────────────────────────────────────────────────

async function importDashboards(folderUid) {
  const dashDir = join(ROOT, "docs/grafana/dashboards")
  const files = readdirSync(dashDir).filter((f) => f.endsWith(".json"))

  for (const file of files) {
    const raw = readFileSync(join(dashDir, file), "utf-8")
    const dashboard = JSON.parse(raw)
    // Remove __inputs/__requires meta — not needed for API import
    const { __inputs, __requires, ...dash } = dashboard
    dash.id = null  // Let Grafana assign an ID; uid is the idempotency key

    try {
      const result = await apiCall("POST", "/api/dashboards/import", {
        dashboard: dash,
        folderUid,
        overwrite: true,
        inputs: __inputs?.map((inp) => ({
          name: inp.name,
          type: inp.type,
          pluginId: inp.pluginId,
          value: inp.pluginId,  // use plugin type as datasource selector
        })) ?? [],
      })
      console.log(`  Dashboard '${dash.title}' → ${result.status} (uid: ${dash.uid})`)
    } catch (err) {
      console.error(`  ERROR importing ${file}:`, err.message)
    }
  }
}

// ── Import alert rules ─────────────────────────────────────────────────────

async function importAlertRules() {
  // Grafana alerting provisioning API accepts the YAML rule groups directly
  // We read the YAML and POST each group to the ruler API
  const alertsDir = join(ROOT, "docs/grafana/alerts")
  const files = readdirSync(alertsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))

  for (const file of files) {
    const raw = readFileSync(join(alertsDir, file), "utf-8")
    // POST the raw YAML to the provisioning endpoint
    const res = await fetch(`${STACK_URL}/api/v1/provisioning/alert-rules`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/yaml", "X-Disable-Provenance": "true" },
      body: raw,
    })
    if (!res.ok) {
      const text = await res.text()
      console.error(`  ERROR importing alerts from ${file}: ${res.status} ${text}`)
    } else {
      console.log(`  Alert rules from '${file}' imported`)
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Provisioning Grafana stack: ${STACK_URL}`)
  console.log("")

  console.log("1. Ensuring 'Dispatcher' folder...")
  const folderUid = await ensureFolder("Dispatcher")

  console.log("2. Importing dashboards...")
  await importDashboards(folderUid)

  console.log("3. Importing alert rules...")
  await importAlertRules()

  console.log("")
  console.log("Done. Open your Grafana stack to verify:")
  console.log(`  ${STACK_URL}/dashboards`)
  console.log(`  ${STACK_URL}/alerting/list`)
}

main().catch((err) => {
  console.error("Fatal:", err.message)
  process.exit(1)
})
