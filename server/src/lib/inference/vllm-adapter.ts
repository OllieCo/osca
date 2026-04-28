/**
 * inference/vllm-adapter.ts — vLLM backend (OpenAI-compatible API)
 *
 * vLLM exposes an OpenAI-compatible REST API:
 *   POST /v1/chat/completions  — chat inference
 *   GET  /v1/models            — list loaded models
 *   GET  /health               — liveness probe
 *
 * This adapter targets vLLM ≥ 0.4 running with --host 0.0.0.0.
 * It is activated by the `vllm-backend` feature flag (see factory.ts).
 *
 * When the flag flips to true the adapter is constructed with
 * config.VLLM_BASE_URL. A side-by-side benchmark against Ollama should
 * be run (Story 1.1) before enabling in production.
 */

import type { InferenceAdapter, ChatOptions } from "./adapter.js"
import { logger } from "../logger.js"
import { inferenceDuration } from "../metrics.js"

const DEFAULT_TIMEOUT_MS = 60_000

// ── HTTP helper (mirrors inference-client.ts but stays local to this adapter) ──

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ── OpenAI-compatible types ────────────────────────────────────────────────────

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface OpenAIChatRequest {
  model: string
  messages: OpenAIChatMessage[]
  temperature?: number
  stream: false
}

interface OpenAIChatResponse {
  choices?: { message?: { content?: string } }[]
}

interface OpenAIModelsResponse {
  data?: { id: string }[]
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export class VLLMAdapter implements InferenceAdapter {
  constructor(private readonly baseUrl: string) {}

  async chat(options: ChatOptions): Promise<string> {
    const messages: OpenAIChatMessage[] = []
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt })
    }
    messages.push({ role: "user", content: options.prompt })

    const body: OpenAIChatRequest = {
      model: options.model,
      messages,
      stream: false,
    }
    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    const start = Date.now()
    const res = await fetchWithTimeout(
      `${this.baseUrl}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      options.timeoutMs
    )

    if (!res.ok) {
      logger.error({ model: options.model, status: res.status, backend: "vllm" }, "vLLM request failed")
      throw new Error(`vLLM ${res.status}: ${res.statusText}`)
    }

    const data = (await res.json()) as OpenAIChatResponse
    const content = data.choices?.[0]?.message?.content ?? ""
    const durationMs = Date.now() - start
    inferenceDuration.record(durationMs, { model: options.model })
    logger.debug(
      { model: options.model, durationMs, responseLen: content.length, backend: "vllm" },
      "vLLM inference complete"
    )
    return content
  }

  async ping(): Promise<boolean> {
    try {
      // vLLM exposes GET /health → 200 when ready
      const res = await fetchWithTimeout(`${this.baseUrl}/health`, { method: "GET" }, 5_000)
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<string[]> {
    try {
      // vLLM OpenAI-compatible: GET /v1/models → { data: [{ id }] }
      const res = await fetchWithTimeout(`${this.baseUrl}/v1/models`, { method: "GET" }, 5_000)
      if (!res.ok) return []
      const data = (await res.json()) as OpenAIModelsResponse
      return data.data?.map((m) => m.id) ?? []
    } catch {
      return []
    }
  }
}
