# Secrets Inventory

_Last reviewed: 2026-04-25. Review quarterly and after any rotation event._

All secrets must live in the secret store (see D-30 for vendor selection). No secret ever touches a git repo or log line. This document lists every secret the Dispatcher system requires, its scope, and its rotation schedule.

## Current state

| Secret | Where used | Current location | Target location | Rotation |
|---|---|---|---|---|
| `OLLAMA_BASE_URL` | server/inference-client | `.env` (not a secret — URL only) | `config.ts` default | N/A |
| `OLLAMA_MODEL` | server/chat, evals | `.env` / hardcoded | `config.ts` default | On model upgrade |

## Planned secrets (required before v1.0.0)

| Secret | Where used | Classification | Rotation schedule | Rotation runbook |
|---|---|---|---|---|
| `DATABASE_URL` (Postgres connection string including password) | server/db | Confidential | 90 days | [TBD after D-30] |
| `REDIS_URL` (Redis auth string) | server/queue, worker | Confidential | 90 days | [TBD after D-30] |
| `JWT_SECRET` (≥32 chars, random) | server/auth | Confidential | 90 days | [TBD after D-30] |
| `STRIPE_SECRET_KEY` (live `sk_live_*`) | server/payments | Confidential | On compromise only; rotate before each pen test | Stripe dashboard → revoke → update store |
| `STRIPE_WEBHOOK_SECRET` (`whsec_*`) | server/payments | Confidential | On compromise | Stripe dashboard → regenerate endpoint |
| `RESEND_API_KEY` | server/email | Confidential | 90 days | Resend dashboard → revoke → update store |
| `SENTRY_DSN` | server, client | Internal | N/A (not a secret, but not public) | — |

## Staff and service token policy

- **Service tokens** (DB, Redis, JWT): rotate every 90 days.
- **Staff tokens** (any personal API key used in CI): rotate every 30 days.
- **Stripe live keys**: rotate before each external pen test; rotate immediately on any suspected compromise.
- **On-demand rotation** (breach / staff offboarding): complete within 4 hours; update runbook if process took longer.

## Rotation runbook template

For each secret:
1. Generate new value (use vendor's randomness, min 32 chars for symmetric keys).
2. Update the secret store with the new value.
3. Trigger a zero-downtime redeploy (if the platform supports rolling restart, prefer that; otherwise schedule a maintenance window).
4. Verify the new value is live by hitting the health endpoint.
5. Revoke the old value in the issuing system.
6. Log the rotation event in this document (date, rotated-by, reason).

## Rotation log

| Date | Secret | Rotated by | Reason |
|---|---|---|---|
| — | — | — | Initial inventory |

## Open questions

- **D-30**: Which secret store? (Doppler / 1Password Secrets Automation / AWS Secrets Manager / HCP Vault). Criterion: AU residency, audit log, rotation API, <$50/mo at current scale. See close-out in Secrets project card.
- Does ST4S require AU residency evidence for the secret store itself, or only for the data it protects?
