/**
 * inference/factory.ts — Feature-flag-driven adapter factory
 *
 * Returns an InferenceAdapter for the current server context.
 * The selection logic is intentionally simple:
 *
 *   vllm-backend flag OFF (default) → OllamaAdapter (existing behaviour)
 *   vllm-backend flag ON            → VLLMAdapter   (new vLLM path)
 *
 * The flag is evaluated server-side with no school context (schoolId: null)
 * because inference routing is a global infrastructure concern, not a per-school
 * setting. Percentage rollout and allowlist rules still apply — for example,
 * setting rolloutPct=0 and adding server IDs to the allowlist lets you run
 * vLLM on one host without touching others.
 *
 * Usage:
 *   const adapter = await getInferenceAdapter()
 *   const response = await adapter.chat({ model, prompt, systemPrompt })
 *
 * The factory is async because flag evaluation reads from the DB (or cache).
 * The overhead is negligible: flags are cached for 5 minutes.
 */

import { evaluateFlag } from "../flags.js"
import { config } from "../config.js"
import { logger } from "../logger.js"
import type { InferenceAdapter } from "./adapter.js"
import { OllamaAdapter } from "./ollama-adapter.js"
import { VLLMAdapter } from "./vllm-adapter.js"

/** Flag key for the vLLM backend switch. */
export const VLLM_BACKEND_FLAG = "vllm-backend"

/**
 * Return an InferenceAdapter selected by the `vllm-backend` feature flag.
 *
 * Pass a schoolId to enable per-school flag evaluation (allowlist/denylist/
 * percentage rollout). Pass null for server-to-server calls (global default).
 */
export async function getInferenceAdapter(
  schoolId: string | null = null
): Promise<InferenceAdapter> {
  const useVllm = await evaluateFlag(VLLM_BACKEND_FLAG, { schoolId, plan: null })

  if (useVllm) {
    logger.debug({ backend: "vllm", baseUrl: config.VLLM_BASE_URL }, "inference: using vLLM adapter")
    return new VLLMAdapter(config.VLLM_BASE_URL)
  }

  logger.debug({ backend: "ollama" }, "inference: using Ollama adapter")
  return new OllamaAdapter()
}
