# Grafana Cloud — Dispatcher Observability

Dashboards, alert rules, and synthetic monitoring probes for Dispatcher.
All configuration is stored as code and can be provisioned idempotently.

---

## Structure

```
docs/grafana/
├── dashboards/
│   ├── system-health.json   # RED method + infra + queue depth
│   └── business.json        # Sessions, inference perf, actions, PII blocks
├── alerts/
│   └── dispatcher-alerts.yaml  # SLO burn, latency, queue, health, memory
├── synthetic-monitoring/
│   └── probes.yaml          # Uptime probes from SYD + SGP
└── README.md                # This file
```

---

## Quick provisioning (automated)

Requires a **Grafana API token** (different from the OTLP ingestion token):

1. In your Grafana stack: **Administration → Service accounts → Add service account**
2. Role: **Admin**
3. **Add service account token** → copy the `glsa_...` value

```bash
export GRAFANA_STACK_URL=https://your-stack.grafana.net
export GRAFANA_API_TOKEN=glsa_...
node scripts/grafana-provision.mjs
```

The script is idempotent — safe to re-run after any dashboard or alert change.

---

## Manual import (dashboards)

1. Grafana UI → **Dashboards → Import**
2. Upload the JSON file from `docs/grafana/dashboards/`
3. Select your **Prometheus/Mimir** datasource when prompted
4. Click **Import**

Repeat for each dashboard file.

---

## Manual import (alert rules)

1. Grafana UI → **Alerting → Alert rules → New alert rule** (or use the provisioning API)
2. Alternatively paste the YAML into **Alerting → Admin → Export/Import**

> **Contact point:** Create a contact point named `dispatcher-oncall` in
> **Alerting → Contact points** (Pushover recommended for solo founder on-call).
> Then create a notification policy routing `team=dispatcher` alerts to it.

---

## Synthetic monitoring (uptime probes)

1. Install the **Synthetic Monitoring** plugin on your Grafana Cloud stack
   (Grafana UI → Administration → Plugins → search "Synthetic Monitoring")
2. Activate it (free tier includes 10k checks/month)
3. Go to **Testing & synthetics → Synthetic Monitoring → Add check**
4. Add an HTTP check using the config in `docs/grafana/synthetic-monitoring/probes.yaml`
   — two checks: one from **Sydney**, one from **Singapore**
5. Target URL: `https://dispatcher.app/api/health` (update once domain is live)

The probes feed the availability SLO calculation:
```promql
sum_over_time(probe_success{job="dispatcher-health"}[30d])
/ count_over_time(probe_success{job="dispatcher-health"}[30d])
```

---

## Custom metrics (planned)

The business dashboard references custom Prometheus counters/histograms that
must be added to the server before those panels populate:

| Metric | Description | Location |
|--------|-------------|----------|
| `dispatcher_inference_queue_waiting` | BullMQ waiting jobs | `inference-queue.ts` |
| `dispatcher_inference_queue_active` | BullMQ active jobs | `inference-queue.ts` |
| `dispatcher_inference_jobs_completed_total` | Counter | `inference-queue.ts` |
| `dispatcher_inference_jobs_failed_total` | Counter | `inference-queue.ts` |
| `dispatcher_inference_duration_milliseconds` | Histogram (TTFT) | `inference-client.ts` |
| `dispatcher_actions_total` | Counter by action type | `agent.ts` |
| `dispatcher_pii_blocks_total` | Counter | eval assertion hook |

These are wired in the next Observability session (Story 4.2 — custom metrics).
Until then, the System Health dashboard panels using standard OTel HTTP metrics
will populate immediately once the server connects to Grafana Cloud.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GRAFANA_OTLP_ENDPOINT` | Yes (prod) | OTLP gateway URL — `https://otlp-gateway-prod-au-southeast-1.grafana.net/otlp` |
| `GRAFANA_OTLP_TOKEN` | Yes (prod) | OTLP ingestion token (from Grafana Cloud → Connections → OpenTelemetry) |
| `GRAFANA_STACK_URL` | Provisioning only | Your stack URL e.g. `https://your-stack.grafana.net` |
| `GRAFANA_API_TOKEN` | Provisioning only | Service account token with Admin role |
