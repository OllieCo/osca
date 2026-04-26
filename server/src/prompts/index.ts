// Prompt registry — single import point for all named prompts.
// API must always import prompts by name through this registry.
// Adding a new use-case: add a new file under prompts/ and register it here.

import { SUPERVISION_SYSTEM_PROMPT } from "./supervision.js"

const PROMPTS: Record<string, string> = {
  supervision: SUPERVISION_SYSTEM_PROMPT,
}

export function getPrompt(name: string): string {
  const prompt = PROMPTS[name]
  if (!prompt) {
    // Fail fast — a missing prompt name is a programming error, not a runtime condition.
    throw new Error(`Unknown prompt: "${name}". Available: ${Object.keys(PROMPTS).join(", ")}`)
  }
  return prompt
}

export function listPrompts(): string[] {
  return Object.keys(PROMPTS)
}
