# Dispatcher — Data Retention Policy

**Story 3.1 (AC 3.1.1, 3.1.2)**  
Version: 1.0 | Effective: 2026-07-01 | Review: annually

This document defines how long Dispatcher retains each category of data and what
happens when the retention period expires. It is linked from the DPA so buyers
see concrete commitments before signing.

---

## Retention Schedule

| Data type | Retention period | Basis | Deletion method |
|---|---|---|---|
| **Account metadata** (User, School records) | Active subscription + 90 days after cancellation/soft-delete | Privacy Act APP 11.2 — retain no longer than necessary | Automated hard-delete via retention-sweep cron (daily, 03:00 UTC) |
| **Action logs** (dispatched school actions) | 12 months from action date | Operational dispute resolution window | Automated purge via retention-sweep |
| **Audit logs** (login, billing, admin events) | 7 years from event date | Australian tax record obligations (ITAA 1936 s 262A) | Automated purge via retention-sweep after 7 years |
| **Tokenised PII cache** (Redis) | 24 hours from creation | Ephemeral scraping context — no long-term storage of staff/student data | Redis TTL set at key creation; no explicit sweep required |
| **Session tokens** (Redis) | 24 hours (or logout, whichever is sooner) | Principle of least privilege | Redis TTL set at key creation |
| **Backup artefacts** (encrypted pg_dump) | 30 days of daily snapshots; 7 days of hourly WAL | Recovery window (RPO = 1 hour) | Automated prune in pg-backup.sh |
| **Stripe payment records** | Retained by Stripe under their DPA; Dispatcher holds subscription status only | Stripe DPA obligations | N/A — Stripe-managed |
| **Analytics / telemetry** (OTel metrics, Grafana) | 13 months rolling (Grafana Cloud default) | Trend analysis and SLO reporting | Grafana Cloud automatic rotation |
| **Error reports** (Sentry) | 90 days (Sentry default) | Bug resolution | Sentry automatic rotation |

---

## Soft-delete and Right-to-Delete

When a user or school account is cancelled or a deletion is requested:

1. **Soft-delete** — `deleted_at` timestamp is set on the record. The record is immediately excluded from all application queries but remains in the database.
2. **Grace period** — 90 days. During this window, the deletion can be reversed by an admin if the request was made in error.
3. **Hard-delete** — At the end of the grace period, the `retention-sweep` cron job permanently removes the record and all directly associated data (audit logs linked to that user/school are retained for the full 7 years separately).

Self-service deletion is available via the Admin Console (coming in Epic 3 Story 3.2).

---

## Tokenised PII — What We Don't Store

Dispatcher's scraping pipeline **never stores raw staff or student identifiers** in the database. The content-script tokenises PII before it leaves the browser:

- Staff names, employee IDs, student QSNs → replaced with opaque tokens before transit
- Tokens live in Redis with a 24-hour TTL
- Raw PII never appears in logs, error reports, or audit records

This design means there is no "PII database" to delete on request — the data never arrives at our servers in identifiable form.

---

## Enforcement

Retention sweeps run automatically at **03:00 UTC daily** via the `retention-sweep.ts` scheduler wired into the Express server. Sweep metrics are published to Grafana (`ospa_retention_*` counters) and will alert if a sweep fails or produces unexpected counts.

For manual purge requests (privacy complaints, right-to-erasure), contact the operator — deletion is executed via the Admin Console or directly via the retention sweep with a target account ID.

---

## Changes to This Policy

Changes are tracked in git. Buyers who have signed a DPA will be notified by email of any material reduction in retention periods. This document is published at `dispatcher.app/trust` (landing page — coming in Security Epic 4).

---

*Reviewed by: Oliver Coady (Founder) | Legal review: pending MSA/DPA finalisation*
