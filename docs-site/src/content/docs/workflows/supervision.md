---
title: Supervision scheduling
description: Automate supervision allocation using Dispatcher's AI workflow.
sidebar:
  order: 1
---

import { Steps, Aside } from '@astrojs/starlight/components';

The Supervision scheduling workflow helps you allocate staff to supervision duties by reading the current supervision grid in OneSchool and proposing placements based on staff availability.

## What Dispatcher can do

- Identify uncovered supervision slots
- Find available staff (no class, not already on supervision) for each slot
- Propose allocations with rationale and a risk rating
- Execute confirmed allocations directly in OneSchool

## What Dispatcher cannot do

- Override mandatory duties or staff agreements
- Access data the logged-in user cannot see
- Confirm allocations without teacher review

## Before you start

- Navigate to the **Supervision schedule** view in OneSchool for the relevant date.
- The Dispatcher side panel must be open and showing "Connected".

## Step-by-step

<Steps>
1. Open the **Supervision schedule** in OneSchool for the day you want to allocate.

2. Click the **Dispatcher icon** in the Chrome toolbar to open the side panel.

3. Select **Supervision scheduling** from the workflow list.

4. In the **Goal** field, describe what you need. Examples:
   - `"Fill all uncovered supervisions for tomorrow"`
   - `"Find someone for B-Block Oval Period 2 — I need a PE teacher if possible"`
   - `"Show me which supervisions still need filling for next Monday"`

5. Click **Start**. Dispatcher reads the supervision grid. Staff names and IDs are tokenised before the AI sees them.

6. Review the **proposed allocations**. Each proposal shows:
   - Which supervision slot
   - Which staff member is proposed (shown as a token, decoded to the real name in your browser)
   - The reason (e.g., "No class scheduled in this period; not currently on supervision duty")
   - A risk level (Low = high confidence; High = Dispatcher is less certain, check manually)

7. For each proposal: click **Confirm** to apply it in OneSchool, or **Skip** to leave it unchanged.

8. When done, close the side panel. All confirmed actions appear in the session history.
</Steps>

<Aside type="note">
Dispatcher executes confirmed actions one at a time, waiting for each OneSchool page update before proceeding to the next. This mirrors what a human would do and avoids race conditions in the OneSchool UI.
</Aside>

## Prompting tips

| Goal | Example prompt |
|---|---|
| Fill all gaps | `"Fill all uncovered supervisions for [date]"` |
| Specific location | `"Find cover for the Library supervision Period 3 tomorrow"` |
| Subject preference | `"Prioritise SOSE or HPE staff for playground supervisions"` |
| View only, no changes | `"Show me which supervisions are uncovered — don't make any changes yet"` |

## Understanding risk levels

| Risk | Meaning | Recommended action |
|---|---|---|
| Low | High confidence — staff member is clearly available | Safe to confirm |
| Medium | Minor uncertainty (e.g., casual staff with limited timetable data) | Review the rationale, then confirm |
| High | Significant uncertainty — Dispatcher may be missing information | Manually verify before confirming |

## Known limitations

- [PLACEHOLDER — add any OneSchool-specific grid layout quirks observed during pilot testing]
- Casual or relief staff who are not yet entered in OneSchool for the day will not be suggested.
- Recurring or exempted duties are not currently visible to Dispatcher — review those manually.
