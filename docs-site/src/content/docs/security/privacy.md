---
title: Privacy & data retention
description: What Dispatcher collects, how long it keeps it, and how to request deletion.
sidebar:
  order: 2
---

import { Aside } from '@astrojs/starlight/components';

## What we collect

### What we do NOT collect

Dispatcher's architecture is designed so that the following data **never reaches our servers**:

- Staff names, email addresses, or employee IDs
- Student names, QSN numbers, or any student record fields
- OneSchool page content, timetable data, or scheduling details
- Any data that the logged-in teacher sees in OneSchool grids

All identifiable data is tokenised in the browser before transit. See [PII tokenisation](/security/overview/#pii-tokenisation).

### What we do collect

| Category | Examples | Purpose |
|---|---|---|
| **Account data** | School name, admin email address, billing contact | Account management, billing, support |
| **Usage counts** | Number of actions executed this month (no content) | Freemium plan enforcement, product analytics |
| **Audit events** | Login timestamp, action type (not content), IP address | Security, compliance, dispute resolution |
| **Error reports** | Stack traces with PII stripped | Bug fixing |

## Retention schedule

| Data type | Retention | Legal basis |
|---|---|---|
| Account metadata (User, School records) | Active subscription + 90 days after cancellation | Privacy Act APP 11.2 |
| Audit logs (login, billing, admin events) | 7 years | Australian tax obligations (ITAA 1936 s 262A) |
| PII token cache (browser Redis) | 24 hours from creation | Ephemeral scraping context |
| Session tokens | 24 hours or logout (whichever is sooner) | Principle of least privilege |
| Backup artefacts | 30 days of daily snapshots | Recovery window (RPO = 1 hour) |
| Error reports (Sentry) | 90 days | Bug resolution |

## Soft-delete and right-to-deletion

When a school account is cancelled or a deletion is requested:

1. **Soft-delete** — the `deleted_at` timestamp is set on the record. The record is excluded from all queries but remains in the database for the grace period.
2. **Grace period** — 90 days. During this window, deletion can be reversed by an admin if the request was made in error.
3. **Hard-delete** — at the end of the grace period, all account data and directly associated records are permanently deleted.

Audit logs linked to a deleted school are retained for the full 7 years (as required by law) but are dissociated from any identifiable account metadata after hard-delete.

## Right of access

You can request a copy of your school's data at any time by contacting **privacy@dispatcher.app**. We will provide an export within 30 days.

## Data residency

All data is stored on Australian-resident infrastructure. Dispatcher does not transfer personal data outside Australia.

<Aside type="note">
Payment data is handled entirely by Stripe and subject to [Stripe's DPA](https://stripe.com/en-au/legal/dpa). Dispatcher only stores your subscription status — never card numbers or bank details.
</Aside>

## Contact

**Privacy Officer:** Oliver Coady  
**Email:** privacy@dispatcher.app  
**Address:** [PLACEHOLDER — add once registered business address is confirmed]

To lodge a complaint about our handling of your data, contact us first. If unresolved, you may escalate to the [Office of the Australian Information Commissioner (OAIC)](https://www.oaic.gov.au/).
