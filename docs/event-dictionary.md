# Dispatcher — Product Analytics Event Dictionary

**Story 1.1 (Event enumeration) / 1.2 (Privacy classification) / 1.3 (Retention policy)**
Version: 1.0 | Effective: 2026-07-01 | Review: annually

This dictionary is the single source of truth for every product-analytics event emitted by
the Dispatcher platform. All emit code **must** reference a name defined here. Changes
require a Privacy Policy review (checklist in the PR template).

---

## Privacy Classification Scale

| Level | Name | What's allowed | Example |
|---|---|---|---|
| **L0** | Anonymous counts | No user or school identifier | Daily `action_executed` total |
| **L1** | School-scoped counts | School ID only, no user identifier | Actions per school per week |
| **L2** | User-scoped counts | Anonymised user ID only (never email/name) | Actions per user for Freemium cap |
| **L3** | With structured metadata | Non-PII metadata (workflow type, error code, token counts) | Inference latency + model name |
| **L4+** | **Disallowed** in extension telemetry | Raw PII, scraped content, token values | ❌ Never |

L4+ in backend telemetry is permitted only in the Audit Log (separate system, separate
retention), never in `telemetry_events`.

---

## Retention Policy

| Classification | Hot retention | Cold retention |
|---|---|---|
| L0 / L1 | 13 months rolling | Aggregates retained indefinitely |
| L2 / L3 | 90 days hot | 12 months cold (compressed + aggregated) |

Raw events older than their retention window are deleted automatically. Aggregates
(counts, histograms) are retained indefinitely for trend analysis.

---

## Events — Extension (Content Script + Side Panel)

> **Note:** Extension telemetry is opt-in only. Events are locally aggregated into
> per-day counts before being flushed; raw events never leave the browser.
> Extension telemetry is handled by a future Epic 2 session once the consent UX lands.

| Event | Owner | Trigger | Properties | Level | Retention |
|---|---|---|---|---|---|
| `extension_installed` | CS | Chrome `onInstalled` event | `version` (string) | L0 | 13 months |
| `extension_opened` | SP | Side panel mounted | — | L0 | 13 months |
| `workflow_started` | SP | User clicks a workflow button | `workflow_type` (string) | L1 | 13 months |
| `action_planned` | SP | Agent returns a plan | `workflow_type`, `plan_step_count` (int) | L1 | 13 months |
| `action_executed` | SP | User confirms an action | `workflow_type`, `action_type` (string) | L2 | 90d / 12m |
| `action_confirmed_by_user` | SP | User clicks Confirm | `workflow_type` | L1 | 13 months |
| `scrape_succeeded` | CS | `extractKendoRows` / `extractRawRows` returns rows | `row_count` (int), `grid_type` (string) | L1 | 13 months |
| `scrape_failed` | CS | Row extraction returns 0 or throws | `error_code` (string), `grid_type` | L1 | 13 months |
| `inference_error` | SP | API returns 5xx or timeout | `error_code`, `attempt` (int) | L1 | 13 months |
| `extension_health_check` | CS | Weekly background heartbeat | `version`, `active_workflows` (int) | L0 | 13 months |

---

## Events — Backend (Express API + Bull Worker)

| Event | Owner | Trigger | Properties | Level | Retention |
|---|---|---|---|---|---|
| `api_request` | API | Every non-health HTTP request completes | `route` (string), `method`, `status` (int), `latency_ms` (int), `school_id` | L3 | 90d / 12m |
| `inference_request` | Worker | Ollama/vLLM returns | `model` (string), `prompt_tokens` (int), `response_tokens` (int), `latency_ms` (int), `cache_hit` (bool), `school_id` | L3 | 90d / 12m |
| `job_enqueued` | API | `inferenceQueue.add()` called | `job_id` (string), `school_id` | L2 | 90d / 12m |
| `job_completed` | Worker | Bull job `completed` event | `job_id`, `school_id`, `duration_ms` (int), `attempts` (int) | L3 | 90d / 12m |
| `job_failed` | Worker | Bull job `failed` (all retries exhausted) | `job_id`, `school_id`, `error_code`, `attempts` (int) | L3 | 90d / 12m |
| `freemium_limit_reached` | API | Action blocked at Freemium cap | `school_id`, `actions_this_month` (int), `cap` (int) | L2 | 90d / 12m |
| `subscription_changed` | API (webhook) | Stripe webhook updates subscription | `school_id`, `plan_from` (string), `plan_to` (string), `reason` (string) | L3 | 90d / 12m |
| `audit_log_entry` | API | Any AuditLog row written | `school_id`, `action` (string) — no user ID, no metadata | L1 | 13 months |

---

## Events — Web (Landing Page)

> Landing analytics are handled by Plausible (cookieless, no consent banner).
> These events are tracked as Plausible custom goals, not via the backend emit helper.

| Event | Owner | Trigger | Plausible goal name |
|---|---|---|---|
| `page_view` | Landing | Any page load | auto-tracked |
| `cta_clicked` | Landing | Primary CTA button | `cta_clicked` |
| `signup_started` | Landing | Email field focused | `signup_started` |
| `signup_completed` | Landing | Stripe Checkout session created | `signup_completed` |
| `pricing_viewed` | Landing | Pricing section scrolled into view | `pricing_viewed` |

---

## Events — Admin Console

> AC analytics are tracked via PostHog self-hosted (AU region). Users are identified
> by `school_id` + anonymised `user_id` — never email or display name.

| Event | Owner | Trigger | Properties | Level |
|---|---|---|---|---|
| `console_login` | AC | Successful auth | `school_id` | L1 |
| `workflow_toggled` | AC | Feature flag toggled | `school_id`, `flag_key` (string), `new_state` (bool) | L2 |
| `user_invited` | AC | Invite email sent | `school_id`, `role` (string) | L1 |
| `usage_report_viewed` | AC | Monthly usage page viewed | `school_id` | L1 |

---

## Disallowed Fields (L4+)

The following must **never** appear in any telemetry event:

- Email addresses, display names, staff names, student names
- QSN numbers, employee IDs, or any education-system identifiers
- OneSchool session tokens, session cookies, or auth headers
- Scraped page content (HTML, text, or structured timetable data)
- IP addresses (allowed only in Audit Log, never in telemetry)
- Free-text user input of any kind
- Token values from the tokenisation layer

Violations are a P0 privacy incident. Any PR that adds an L4+ field to a telemetry
event requires an immediate revert and a post-mortem.

---

## Schema Reference (TypeScript)

Each event's TypeScript type is defined in `server/src/lib/telemetry/emit.ts`.
The `emit()` function enforces the dictionary at compile time — if you add an event here,
add its `Props` type to the union in `emit.ts`.

---

## Changes to This Dictionary

Changes are tracked in git. Any addition or modification to an event's classification or
properties triggers a Privacy Policy review item in the PR checklist. Removals (stopping
collection of an event) do not require Privacy Policy review but should be noted in the
commit message.

---

*Reviewed by: Oliver Coady (Founder) | Privacy review: pending Privacy Policy finalisation*
