// Direct Ollama HTTP client — no n8n dependency.
// Shared origin: MySchool n8n-client.ts (Ollama portion only, n8n removed).

import { config } from "./config.js"
import { logger } from "./logger.js"

const DEFAULT_TIMEOUT_MS = 60_000

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function chatWithOllama(
  model: string,
  prompt: string,
  systemPrompt?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  temperature?: number
): Promise<string> {
  const messages: { role: string; content: string }[] = []
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt })
  messages.push({ role: "user", content: prompt })

  const body: Record<string, unknown> = { model, messages, stream: false }
  if (temperature !== undefined) body.options = { temperature }

  const start = Date.now()
  const res = await fetchWithTimeout(
    `${config.OLLAMA_BASE_URL}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    timeoutMs
  )

  if (!res.ok) {
    logger.error({ model, status: res.status }, "Ollama request failed")
    throw new Error(`Ollama ${res.status}: ${res.statusText}`)
  }

  const data = (await res.json()) as { message?: { content?: string } }
  const content = data.message?.content ?? ""
  logger.debug({ model, durationMs: Date.now() - start, responseLen: content.length }, "inference complete")
  return content
}

export async function pingOllama(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${config.OLLAMA_BASE_URL}/api/tags`, { method: "GET" }, 5_000)
    return res.ok
  } catch {
    return false
  }
}

export async function listModels(): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${config.OLLAMA_BASE_URL}/api/tags`, { method: "GET" }, 5_000)
    if (!res.ok) return []
    const data = (await res.json()) as { models?: { name: string }[] }
    return data.models?.map((m) => m.name) ?? []
  } catch {
    return []
  }
}
