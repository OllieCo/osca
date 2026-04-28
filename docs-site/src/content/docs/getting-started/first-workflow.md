---
title: Your first workflow
description: Run your first AI-assisted OneSchool task with Dispatcher.
sidebar:
  order: 2
---

import { Steps, Aside } from '@astrojs/starlight/components';

This guide walks through a complete Dispatcher session from opening OneSchool to confirming an AI-proposed action. The example uses the Supervision scheduling workflow.

## How Dispatcher works

```
Teacher opens OneSchool → Extension reads the grid → AI proposes an action → Teacher confirms → Extension executes
```

At no point does the AI act without the teacher confirming. **You always have the final say.**

## Before you start

- The Dispatcher server is running ([install guide](/getting-started/install/))
- The extension is installed and connected to your server
- You are logged into OneSchool in the same Chrome window

## Running Supervision scheduling

<Steps>
1. **Open OneSchool** in Chrome and navigate to the Supervision schedule for today.

2. **Click the Dispatcher icon** in the Chrome toolbar. The side panel opens on the right side of the screen.

3. **Select "Supervision scheduling"** from the workflow list.

4. **Describe what you need** in plain English. For example:
   > "Fill all the uncovered supervisions for tomorrow morning using available staff who don't have a class."

5. **Click Start**. Dispatcher reads the current OneSchool grid (staff names and identifiers are tokenised immediately — the AI never sees raw names), then the AI proposes a set of actions.

6. **Review the proposal**. Each proposed change is shown with:
   - What will change (e.g., "Assign [STAFF_003] to B-Block Oval — Period 1")
   - Why (e.g., "No class scheduled; available based on timetable data")
   - Risk level (Low / Medium / High)

7. **Confirm or reject each action**. Click **Confirm** to apply the change in OneSchool, or **Skip** to leave it unchanged.

8. **Done.** Dispatcher logs every confirmed action in the audit trail.
</Steps>

<Aside type="note">
The tokenised names shown in the proposal (e.g., `[STAFF_003]`) are decoded back to real names only within your browser — the server never sees the originals.
</Aside>

## Understanding the side panel

| Element | Description |
|---|---|
| **Workflow selector** | Choose Supervision, Relief, or Clash detection |
| **Goal input** | Describe what you want in plain English |
| **Proposal card** | Each AI-proposed action with its rationale and risk |
| **Confirm / Skip buttons** | Execute or pass on each action |
| **Session history** | List of all actions taken in this session |
| **Status indicator** | Shows if the server is reachable and the AI is ready |

## Tips for better results

- **Be specific.** "Fill supervisions for tomorrow morning for B-Block only" gives better results than "fill supervisions".
- **One task at a time.** Dispatcher works best when the goal is a single clear workflow — don't try to combine Supervision and Relief in one goal.
- **Check the risk level.** High-risk actions (rare) mean the AI is less confident — review those manually before confirming.

## Next steps

- [Supervision scheduling in depth →](/workflows/supervision/)
- [Relief allocation →](/workflows/relief/)
- [Clash detection →](/workflows/clash-detection/)
