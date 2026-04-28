/**
 * inference/ollama-adapter.ts — Ollama backend
 *
 * Wraps the existing lib/inference-client.ts functions behind the
 * InferenceAdapter interface. lib/inference-client.ts is unchanged so that
 * the health route's pingOllama() / listModels() continue to work directly.
 *
 * This adapter is the default when the `vllm-backend` feature flag is off.
 */

import type { InferenceAdapter, ChatOptions } from "./adapter.js"
import { chatWithOllama, pingOllama, listModels } from "../inference-client.js"

export class OllamaAdapter implements InferenceAdapter {
  async chat(options: ChatOptions): Promise<string> {
    return chatWithOllama(
      options.model,
      options.prompt,
      options.systemPrompt,
      options.timeoutMs,
      options.temperature
    )
  }

  async ping(): Promise<boolean> {
    return pingOllama()
  }

  async listModels(): Promise<string[]> {
    return listModels()
  }
}
