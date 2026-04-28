---
title: Data handling for IT admins
description: Technical summary of how Dispatcher handles school data — for IT leads and procurement.
sidebar:
  order: 3
---

import { Aside } from '@astrojs/starlight/components';

## Data flow diagram

```
OneSchool grid (browser)
  │
  ▼
Content Script (browser)
  │  Tokenises all PII before this line
  │  Staff names → [NAME_001]   Student QSNs → [QSN_001]
  ▼
Side Panel (browser)
  │  HTTPS POST  (tokens only, never raw PII)
  ▼
Dispatcher API (your school's server)
  │
  ├── Redis Queue → Bull Worker → Ollama AI (local, your hardware)
  │                                   │
  │                          Proposes action using tokens only
  │                          Returns action plan (tokens only)
  │
  └── PostgreSQL (audit log — action type, timestamp, school ID)
         No raw staff/student data stored
```

## Data that stays in the browser

The following never leaves the browser under any circumstances:

- Raw staff names, employee IDs, or email addresses
- Raw student names, QSN numbers, or any student record fields
- OneSchool session cookies or authentication credentials
- The actual content of OneSchool timetable grids

The content script creates a token map in browser memory (`sessionStorage`) and replaces all identifiable values with opaque tokens before any data is sent to the Dispatcher server.

<Aside type="tip">
You can verify this yourself using Chrome DevTools → Network tab. Filter for requests to your Dispatcher server IP. You will see only tokenised payloads — no recognisable names or IDs.
</Aside>

## Data stored on the server

| Table | Contents | Retention |
|---|---|---|
| `schools` | School name, domain, subscription status | Active + 90 days after cancellation |
| `users` | Admin display name, email address, role, password hash | Active + 90 days after cancellation |
| `subscriptions` | Plan tier, billing period, Stripe subscription ID (no payment details) | Active + 90 days |
| `audit_logs` | Action type, school ID, timestamp, IP address | 7 years (legal obligation) |
| `telemetry_events` | Action counts (no content, no PII), school ID | 90 days hot / 12 months cold |

## Data NOT stored on the server

| Data type | Why it is not stored |
|---|---|
| Staff names, employee IDs | Tokenised in browser — server only sees `[NAME_###]` |
| Student QSNs | Tokenised in browser — server only sees `[QSN_###]` |
| OneSchool page content | Never transmitted — only structured action plans are sent |
| AI model inputs/outputs | Not persisted — discarded after each inference |
| Raw PII of any kind | Architectural constraint — the token map never leaves the browser |

## Encryption

| Layer | Method |
|---|---|
| Data in transit | TLS 1.2+ (HTTPS) on all API connections |
| Data at rest | PostgreSQL on an encrypted volume (AES-256) — configured at server setup |
| Backup artefacts | AES-256-CBC + PBKDF2 with a per-environment key |
| Passwords | Argon2id with a unique salt per credential |

## Access controls

- **Role-based access:** Admin users can view audit logs and manage school settings. Teacher accounts can only run workflows.
- **Audit log:** Immutable — no application code path permits deletion or modification of audit log records.
- **API authentication:** JWT tokens with 24-hour expiry; revoked immediately on logout.

## Backup and recovery

Automated daily backups are taken of the PostgreSQL database and encrypted before storage. The recovery point objective (RPO) is 1 hour (hourly WAL shipping). The recovery time objective (RTO) is 4 hours.

Backups are stored on Australian-resident infrastructure. For the full backup and DR runbook, contact your implementation engineer.

## Questions for procurement

**Is Dispatcher compliant with the QLD DoE's ICT requirements?**  
Dispatcher is preparing a Safer Technologies 4 Schools (ST4S) submission. Once lodged, the reference number will be published on this page.

**Where is data stored?**  
On the server you control, within your school or school network. Dispatcher does not use cloud databases or external data processors for personal data.

**Can we inspect the source code?**  
Yes. The source code is available to authorised evaluators under NDA prior to the public CWS release. Contact sales@dispatcher.app.

**What happens to data if we cancel?**  
Account data is soft-deleted immediately (excluded from all queries) and permanently deleted after a 90-day grace period. Audit logs are retained for 7 years per legal obligation, then deleted. A full data export is available on request.
