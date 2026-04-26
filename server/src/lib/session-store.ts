// In-process session store — sufficient for single-server v1.0.0.
// Extracted from agent.ts so the inference worker can update sessions
// without creating a circular dependency.

import type { AgentSession } from "../types/index.js"

export const sessions = new Map<string, AgentSession>()
