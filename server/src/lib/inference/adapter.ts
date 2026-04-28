/**
 * inference/adapter.ts — InferenceAdapter interface
 *
 * All inference backends (Ollama, vLLM, future providers) implement this
 * interface. The rest of the system depends only on this contract — never
 * on a concrete HTTP client.
 *
 * Switching backends is done via the `vllm-backend` feature flag in factory.ts.
 */

// ── Chat request options ───────────────────────────────────────────────────────

export interface ChatOptions {
  /** The model name, e.g. "gemma3:4b" (Ollama) or "gemma-3-4b" (vLLM). */
  model: string
  /** The user-turn prompt. */
  prompt: string
  /** Optional system prompt prepended as a system message. */
  systemPrompt?: string
  /** Sampling temperature — 0 = deterministic, 1 = creative. Omit to use backend default. */
  temperature?: number
  /** Request timeout in milliseconds. Defaults to adapter-specific value (usually 60 s). */
  timeoutMs?: number
}

// ── Adapter interface ──────────────────────────────────────────────────────────

export interface InferenceAdapter {
  /**
   * Send a chat completion request and return the model's text response.
   * Throws if the request fails or times out.
   */
  chat(options: ChatOptions): Promise<string>

  /**
   * Ping the inference backend to confirm it is reachable.
   * Returns false on any error — never throws.
   */
  ping(): Promise<boolean>

  /**
   * List available model IDs on this backend.
   * Returns an empty array on any error — never throws.
   */
  listModels(): Promise<string[]>
}
