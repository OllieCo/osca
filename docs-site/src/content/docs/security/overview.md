---
title: Security overview
description: How Dispatcher protects your school's data.
sidebar:
  order: 1
---

import { Aside, Card, CardGrid } from '@astrojs/starlight/components';

This page summarises Dispatcher's security architecture. It is intended for school IT leads, privacy officers, and procurement evaluators. For the full data handling policy, see [Privacy & data retention](/security/privacy/).

## Architecture summary

```
OneSchool (browser) → Content Script → Tokenisation → Side Panel → HTTPS → On-premises server → Local AI
```

**Every component runs within your school network.** Dispatcher does not use cloud AI services, external data brokers, or third-party analytics that receive personal data.

## What Dispatcher does and does not do

| ✅ Does | ❌ Does not |
|---|---|
| Read OneSchool grids that the logged-in teacher can already see | Access any data the teacher cannot see |
| Tokenise PII before it leaves the browser | Send raw names, QSNs, or employee IDs to the server |
| Propose actions for the teacher to confirm | Take any action without explicit teacher confirmation |
| Log every confirmed action in an on-premises audit trail | Send audit logs to external services |
| Run AI inference on your own hardware | Use OpenAI, Anthropic, Google, or any cloud LLM |
| Store data subject to your school's retention policies | Retain data beyond the configured retention window |

## PII tokenisation

Before any data leaves the browser, the Dispatcher content script replaces identifiable values with opaque tokens:

| Original value | What the server sees |
|---|---|
| `Jane Smith` (staff name) | `[NAME_001]` |
| `123456789` (student QSN) | `[QSN_001]` |
| `EQ12345` (employee ID) | `[EMP_001]` |

Tokens are stored in the browser's memory with a 24-hour expiry. They are never written to disk, never sent to external servers, and are discarded when the browser tab closes.

<Aside type="note">
The AI model plans actions using only tokens. It never sees, stores, or learns from real staff or student data.
</Aside>

## Data retention

| Data type | Retention period | Where stored |
|---|---|---|
| PII tokens | 24 hours (browser memory only) | Browser RAM — never server |
| Audit logs | 7 years (tax obligations) | On-premises PostgreSQL |
| Account metadata | Active subscription + 90 days | On-premises PostgreSQL |
| AI inference logs | None — not stored | N/A |
| Session data | 24 hours | On-premises Redis |

Full retention schedule: [Privacy & data retention →](/security/privacy/)

## Network traffic

Dispatcher makes the following outbound connections:

| Destination | Purpose | Contains PII? |
|---|---|---|
| Your Dispatcher server (LAN) | AI inference, action logging | No — tokenised only |
| `dispatcher.app` | Licence verification (token only) | No |
| `stripe.com` | Subscription payments | No (handled by Stripe, not Dispatcher) |

No connection is made to external AI services, telemetry platforms, or analytics providers that receive personal data.

## Authentication & access control

- **Role-based access:** Admin, Teacher roles with separate permission sets.
- **Audit log:** Every action (login, workflow execution, admin change) is immutably logged with timestamp and user identity.
- **Session tokens:** 24-hour expiry; revoked on logout.
- **HTTPS:** All server communications are encrypted in transit (TLS 1.2+).
- **Passwords:** Argon2id hashing; minimum entropy enforced.

## Compliance

<CardGrid>
  <Card title="Privacy Act 1988 (Cth)" icon="document">
    Data handling follows Australian Privacy Principles (APPs) 3, 6, 10, and 11. No data is used for purposes beyond the stated workflow automation.
  </Card>
  <Card title="Education (General Provisions) Act 2006" icon="document">
    Student data is never stored in identifiable form on the Dispatcher server. The content script tokenises all student identifiers before transit.
  </Card>
  <Card title="QLD IS18 Information Security" icon="approve-check">
    Dispatcher is designed to align with the QLD Government IS18 policy framework. A formal IS18 self-assessment is in progress for the ST4S submission.
  </Card>
  <Card title="Australian Spam Act 2003" icon="email">
    Dispatcher sends transactional emails only (account lifecycle, billing). No marketing without explicit opt-in.
  </Card>
</CardGrid>

## ST4S assessment

Dispatcher is preparing a Safer Technologies 4 Schools (ST4S) submission to the QLD DoE. The submission covers:

- Data storage location (on-premises, AU-resident)
- PII tokenisation architecture
- Access controls and audit logging
- Retention and deletion procedures
- Vulnerability management (Dependabot, Semgrep, SBOM)

The ST4S submission reference will be published here once lodged.

## Responsible disclosure

Found a security issue? Email **security@dispatcher.app** with details. We aim to acknowledge within 24 hours and resolve critical issues within 72 hours. We do not currently operate a bug bounty programme.
