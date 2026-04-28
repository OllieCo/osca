---
title: Changelog
description: Release history for Dispatcher.
sidebar:
  order: 2
---

This changelog tracks releases of the Dispatcher server and Chrome extension.

Releases follow [Semantic Versioning](https://semver.org/). Server and extension versions are kept in sync for each release.

The full commit history is on [GitHub](https://github.com/ospa-au/dispatcher).

---

## Unreleased

Changes on `main` that are not yet in a tagged release.

- Typed product-analytics emit helper with compile-time schema enforcement
- Freemium enforcement: 100-action monthly cap for Free plan schools
- Server-side rate limiting (3 tiers: global, inference, health)
- Abuse signal logging middleware (401/429/400 spikes)
- Automated daily backup pipeline with AES-256 encryption + SHA-256 integrity checks
- Disaster recovery runbook with RPO=1h / RTO=4h
- Data retention policy with automated sweep (90-day soft-delete grace + 7-year audit log)
- BullMQ inference queue — inference jobs no longer block HTTP request thread
- Extended health check endpoint (`/api/health`) pinging Postgres + Redis
- Pino structured request logging with PII auto-redaction
- Docker Compose stack (API + Postgres + Redis + Ollama)
- OTel tracing, Grafana dashboards, Sentry error tracking
- Dependabot, Semgrep SAST, Gitleaks secret scanning, SBOM generation

---

## v0.1.0

*Local proof of concept. Not for production use.*

- Initial OneSchool DOM scraping via Kendo grid selectors
- PII tokenisation in content script
- Ollama-backed action planning
- Basic side panel UI
