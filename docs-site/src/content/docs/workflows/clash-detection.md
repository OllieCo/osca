---
title: Clash detection
description: Surface timetable clashes across OneSchool grids instantly.
sidebar:
  order: 3
---

import { Aside } from '@astrojs/starlight/components';

The Clash detection workflow reads timetable grids in OneSchool and surfaces conflicts — staff double-booked, rooms double-allocated, or students scheduled for overlapping classes.

## What Dispatcher can do

- Detect staff clashes (same teacher in two places at the same time)
- Detect room clashes (same room allocated to two classes)
- List clashes with the conflicting entries for manual resolution
- [PLACEHOLDER — additional clash types once confirmed with pilot schools]

## Step-by-step

1. Navigate to the **Timetable** view in OneSchool.
2. Open the Dispatcher side panel and select **Clash detection**.
3. Describe the check you want:
   - `"Check for any staff clashes in next week's timetable"`
   - `"Are there any room double-bookings on Monday?"`
   - `"Show me all clashes for the Science department"`
4. Click **Start**. Dispatcher reads the timetable grid and the AI analyses it for conflicts.
5. Review the listed clashes — each shows the two conflicting entries.

<Aside type="note">
Clash detection is read-only. Dispatcher lists the conflicts for you to resolve manually in OneSchool. It does not propose or execute resolutions automatically (this may change in a future release based on pilot feedback).
</Aside>

## Known limitations

- [PLACEHOLDER — update after pilot testing]
- Detection accuracy depends on the completeness of the OneSchool timetable data. Partially published timetables may produce false negatives.
