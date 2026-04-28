---
title: Relief allocation
description: Find and allocate relief teachers for absent staff using Dispatcher.
sidebar:
  order: 2
---

import { Steps, Aside } from '@astrojs/starlight/components';

The Relief allocation workflow reads the current day's absences and timetable, then proposes relief placements for uncovered classes.

## What Dispatcher can do

- Identify classes without a teacher due to staff absence
- Find available relief teachers from the OneSchool pool
- Propose relief allocations with subject-match rationale
- Execute confirmed allocations in OneSchool

## Step-by-step

<Steps>
1. Navigate to the **Daily Organisation** or **Relief** view in OneSchool for today.

2. Open the **Dispatcher side panel** and select **Relief allocation**.

3. In the **Goal** field, describe the task:
   - `"Allocate relief for all uncovered classes today"`
   - `"Find a Maths-capable relief teacher for Period 3 Year 10"`
   - `"Who is available for relief this afternoon?"`

4. Click **Start**. Dispatcher reads the absence and timetable grids. All staff identifiers are tokenised before the AI sees them.

5. Review each proposed allocation — the proposed relief teacher, the class being covered, and the match reason (e.g., "Registered to teach Mathematics; no class Period 3").

6. **Confirm** or **Skip** each proposal.
</Steps>

<Aside type="note">
[PLACEHOLDER — document OneSchool-specific behaviour for the Relief grid once pilot testing confirms the exact grid structure and selectors.]
</Aside>

## Prompting tips

| Scenario | Example prompt |
|---|---|
| All absences | `"Allocate relief for all uncovered periods today"` |
| Subject-specific | `"Find a Science teacher to cover Period 2 Year 9"` |
| Half-day absence | `"Cover [STAFF_NAME]'s classes for the afternoon only"` |
| View only | `"List uncovered classes for today without making changes"` |

## Known limitations

- [PLACEHOLDER — to be updated after pilot testing]
- Relief teachers must be rostered in OneSchool on the current day to appear as available.
- Subject registration data sourced from OneSchool; casual teachers with limited OneSchool profiles may show as lower-confidence matches.
