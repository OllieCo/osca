# Observability Vendor Decision — D-34

**Decision:** Grafana Cloud (AU region) as the primary observability platform.
**Status:** Recommendation pending Ollie ratification. Account provisioning is Ollie's action.
**Date:** 2026-04-25

---

## Criteria scored (1–5 each)

| Criterion | Grafana Cloud AU | Datadog | Self-hosted (Loki/Tempo/Mimir) | Better Stack |
|-----------|-----------------|---------|-------------------------------|-------------|
| AU data residency | 5 — Sydney PoP | 3 — US/EU only, AU proxy available | 5 — on-prem | 2 — EU only |
| OTel native | 5 — first-class | 3 — proprietary SDK preferred | 5 — native | 3 — partial |
| Cost at ≤1k MAU | 5 — free tier generous | 1 — expensive from day 1 | 4 — infra cost only | 4 — affordable |
| Logs + Metrics + Traces unified | 5 — Loki + Mimir + Tempo | 5 — unified | 5 — if self-hosted stack | 3 — logs-first |
| Sentry parity (errors) | 3 — not Sentry's focus | 3 | 3 | 2 |
| Ergonomics / DX | 4 — good UI, some complexity | 5 — best DX | 2 — operational overhead | 4 — simple |
| Managed (low ops burden) | 5 | 5 | 1 | 5 |
| **Total** | **32** | **25** | **25** | **23** |

## Decision rationale

Grafana Cloud AU wins on the combination of AU data residency (ST4S requirement), OTel-native support, generous free tier for early traffic, and unified three-pillar coverage (Loki for logs, Mimir for metrics, Tempo for traces). Datadog is best-in-class DX but prohibitively expensive before product-market fit. Self-hosted is viable post-Series A but creates operational burden for a single founder. Better Stack lacks AU residency.

**Sentry remains a separate tool** for exception tracking — Grafana Cloud does not replace Sentry's error-grouping UX. Both run concurrently; Grafana receives OTel telemetry, Sentry receives errors.

## Required actions (Ollie)

- [ ] Create Grafana Cloud account in **AU region** (Sydney)
- [ ] Invite `engineering@dispatcher.app` as Admin
- [ ] Record Grafana Cloud instance URL + API key in Doppler/secret store under `GRAFANA_OTLP_ENDPOINT` and `GRAFANA_OTLP_TOKEN`
- [ ] Create Sentry project for `dispatcher-server` in **AU region** (if available) or EU with AU sub-processor disclosure
- [ ] Record Sentry DSN in Doppler under `SENTRY_DSN`
- [ ] Calendar monthly OBS cost review (15 min, first Monday of each month)

## Stack mapping

| Signal | Tool | Retention |
|--------|------|-----------|
| Structured logs | Grafana Loki (AU) | 30 days |
| RED metrics | Grafana Mimir (AU) | 13 months |
| Distributed traces | Grafana Tempo (AU) | 7 days |
| Exceptions + releases | Sentry (AU/EU) | 90 days |
| Uptime probes | Grafana Synthetic Monitoring (SYD + SGP) | — |
