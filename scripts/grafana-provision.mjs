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
      const status = result.status ?? result.imported ?? "ok"
      console.log(`  Dashboard '${dash.title}' → ${status} (uid: ${dash.uid})`)
    } catch (err) {
      console.error(`  ERROR importing ${file}:`, err.message)
    }
  }
}

// ── Import alert rules ─────────────────────────────────────────────────────
// The Grafana provisioning HTTP API accepts alert rules one at a time as JSON.
// We define rules as inline objects here rather than parsing the YAML doc.

async function importAlertRules(folderUid) {
  const rules = buildAlertRules(folderUid)
  let imported = 0

  for (const rule of rules) {
    try {
      // Check if rule already exists
      const existing = await fetch(`${STACK_URL}/api/v1/provisioning/alert-rules/${rule.uid}`, { headers })
      if (existing.ok) {
        // Update via PUT
        const res = await fetch(`${STACK_URL}/api/v1/provisioning/alert-rules/${rule.uid}`, {
          method: "PUT",
          headers: { ...headers, "X-Disable-Provenance": "true" },
          body: JSON.stringify(rule),
        })
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
        console.log(`  Updated alert rule '${rule.title}'`)
      } else {
        // Create via POST
        const res = await fetch(`${STACK_URL}/api/v1/provisioning/alert-rules`, {
          method: "POST",
          headers: { ...headers, "X-Disable-Provenance": "true" },
          body: JSON.stringify(rule),
        })
        if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
        console.log(`  Created alert rule '${rule.title}'`)
      }
      imported++
    } catch (err) {
      console.error(`  ERROR on rule '${rule.title}':`, err.message)
    }
  }
  console.log(`  ${imported}/${rules.length} alert rules provisioned`)
}

function prom(expr, refId, legendFormat = "") {
  return {
    refId,
    relativeTimeRange: { from: 600, to: 0 },
    datasourceUid: "${DS_PROMETHEUS}",
    model: { expr, legendFormat, refId, instant: false, range: true, editorMode: "code" },
  }
}

function mathExpr(expression, refId) {
  return { refId, datasourceUid: "__expr__", model: { type: "math", expression, refId } }
}

function thresholdExpr(expression, refId, gt) {
  return {
    refId,
    datasourceUid: "__expr__",
    model: { type: "threshold", expression, refId, conditions: [{ evaluator: { type: "gt", params: [gt] }, operator: { type: "and" }, query: { params: [expression] }, reducer: { type: "last" } }] },
  }
}

function buildAlertRules(folderUID) {
  const base = { orgID: 1, folderUID, isPaused: false, execErrState: "Error", noDataState: "NoData" }

  return [
    {
      ...base,
      uid: "dispatcher-slo-fast-burn",
      title: "SLO — Fast burn (1h window)",
      ruleGroup: "slo-burn",
      for: "5m",
      labels: { severity: "critical", team: "dispatcher" },
      annotations: {
        summary: "API error-budget burning fast",
        description: "Fast burn: >14x error budget consumption rate. Budget exhausted in ~2h. Check /api/health and Sentry immediately.",
      },
      condition: "C",
      data: [
        prom(`sum(rate(http_server_duration_milliseconds_count{service_name="dispatcher-api",http_status_code=~"5.."}[1h])) / sum(rate(http_server_duration_milliseconds_count{service_name="dispatcher-api"}[1h]))`, "A"),
        mathExpr("$A > (14 * 0.005)", "C"),
      ],
    },
    {
      ...base,
      uid: "dispatcher-slo-slow-burn",
      title: "SLO — Slow burn (6h window)",
      ruleGroup: "slo-burn",
      for: "15m",
      labels: { severity: "warning", team: "dispatcher" },
      annotations: { summary: "SLO error budget slow burn", description: "3x burn rate over 6h. Review recent deployments." },
      condition: "C",
      data: [
        prom(`sum(rate(http_server_duration_milliseconds_count{service_name="dispatcher-api",http_status_code=~"5.."}[6h])) / sum(rate(http_server_duration_milliseconds_count{service_name="dispatcher-api"}[6h]))`, "A"),
        mathExpr("$A > (3 * 0.005)", "C"),
      ],
    },
    {
      ...base,
      uid: "dispatcher-latency-p95",
      title: "SLO — p95 latency > 2s on /api/agent",
      ruleGroup: "latency",
      for: "5m",
      labels: { severity: "warning", team: "dispatcher" },
      annotations: { summary: "p95 latency SLO breach", description: "p95 response time on /api/agent exceeded 2000ms SLO for 5 minutes. Check Ollama latency and queue depth." },
      condition: "C",
      data: [
        prom(`histogram_quantile(0.95, sum by (le) (rate(http_server_duration_milliseconds_bucket{service_name="dispatcher-api",http_route=~"/api/agent.*"}[5m])))`, "A"),
        thresholdExpr("A", "C", 2000),
      ],
    },
    {
      ...base,
      uid: "dispatcher-queue-depth",
      title: "Inference queue backlog > 10",
      ruleGroup: "queue",
      for: "3m",
      labels: { severity: "warning", team: "dispatcher" },
      annotations: { summary: "BullMQ inference queue backlog", description: ">10 waiting inference jobs for 3+ min. Worker may be stalled." },
      condition: "C",
      data: [
        prom(`dispatcher_inference_queue_waiting{service_name="dispatcher-api"}`, "A"),
        thresholdExpr("A", "C", 10),
      ],
    },
    {
      ...base,
      uid: "dispatcher-queue-failed",
      title: "Inference job failure rate elevated",
      ruleGroup: "queue",
      for: "5m",
      labels: { severity: "critical", team: "dispatcher" },
      annotations: { summary: "Inference jobs failing", description: ">3 inference job failures in 5 min. Teachers seeing stuck/failed actions. Check Ollama and BullMQ dead-letter queue." },
      condition: "C",
      data: [
        prom(`increase(dispatcher_inference_jobs_failed_total{service_name="dispatcher-api"}[5m])`, "A"),
        thresholdExpr("A", "C", 3),
      ],
    },
    {
      ...base,
      uid: "dispatcher-health-down",
      title: "API /api/health returning 503",
      ruleGroup: "health",
      for: "2m",
      labels: { severity: "critical", team: "dispatcher" },
      annotations: { summary: "Dispatcher API degraded (503)", description: "/api/health returning 503 — Postgres or Redis unreachable. Check containers immediately." },
      condition: "C",
      data: [
        prom(`sum(rate(http_server_duration_milliseconds_count{service_name="dispatcher-api",http_route="/api/health",http_status_code="503"}[1m]))`, "A"),
        thresholdExpr("A", "C", 0),
      ],
    },
    {
      ...base,
      uid: "dispatcher-memory-high",
      title: "API process memory > 512MB",
      ruleGroup: "resources",
      for: "10m",
      labels: { severity: "warning", team: "dispatcher" },
      annotations: { summary: "API RSS memory elevated", description: "Node.js process using >512MB RSS for 10+ min. Check for memory leaks." },
      condition: "C",
      data: [
        prom(`process_resident_memory_bytes{service_name="dispatcher-api"}`, "A"),
        thresholdExpr("A", "C", 536870912),
      ],
    },
  ]
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
  await importAlertRules(folderUid)

  console.log("")
  console.log("Done. Open your Grafana stack to verify:")
  console.log(`  ${STACK_URL}/dashboards`)
  console.log(`  ${STACK_URL}/alerting/list`)
}

main().catch((err) => {
  console.error("Fatal:", err.message)
  process.exit(1)
})
