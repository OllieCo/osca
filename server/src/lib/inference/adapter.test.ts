/**
 * adapter.test.ts — InferenceAdapter unit tests
 *
 * Tests cover:
 *   OllamaAdapter — delegates to chatWithOllama / pingOllama / listModels
 *   VLLMAdapter   — OpenAI-compatible /v1/chat/completions, /health, /v1/models
 *   factory       — returns OllamaAdapter by default; VLLMAdapter when flag is on
 *
 * No live inference server required — fetch and flags are fully mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Inference client — mocked so OllamaAdapter tests don't need a live Ollama
const { mockChatWithOllama, mockPingOllama, mockListModels } = vi.hoisted(() => ({
  mockChatWithOllama: vi.fn<() => Promise<string>>(),
  mockPingOllama: vi.fn<() => Promise<boolean>>(),
  mockListModels: vi.fn<() => Promise<string[]>>(),
}))

vi.mock("../inference-client.js", () => ({
  chatWithOllama: mockChatWithOllama,
  pingOllama: mockPingOllama,
  listModels: mockListModels,
}))

// Feature flags — mocked so factory tests control the flag value
const { mockEvaluateFlag } = vi.hoisted(() => ({
  mockEvaluateFlag: vi.fn<() => Promise<boolean>>(),
}))

vi.mock("../flags.js", () => ({
  evaluateFlag: mockEvaluateFlag,
}))

// Config — provide VLLM_BASE_URL without needing .env
vi.mock("../config.js", () => ({
  config: {
    OLLAMA_BASE_URL: "http://ollama-test:11434",
    VLLM_BASE_URL: "http://vllm-test:8000",
    OLLAMA_MODEL: "gemma3:4b",
  },
}))

// Logger / metrics — silence output
vi.mock("../logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("../metrics.js", () => ({
  inferenceDuration: { record: vi.fn() },
}))

// Mock global fetch for VLLMAdapter tests
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

// ── Imports (after mocks) ──────────────────────────────────────────────────────

import { OllamaAdapter } from "./ollama-adapter.js"
import { VLLMAdapter } from "./vllm-adapter.js"
import { getInferenceAdapter, VLLM_BACKEND_FLAG } from "./factory.js"

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── OllamaAdapter ──────────────────────────────────────────────────────────────

describe("OllamaAdapter", () => {
  const adapter = new OllamaAdapter()

  describe("chat()", () => {
    it("delegates to chatWithOllama with correct arguments", async () => {
      mockChatWithOllama.mockResolvedValueOnce('{"type":"navigate","description":"go"}')

      const result = await adapter.chat({
        model: "gemma3:4b",
        prompt: "What next?",
        systemPrompt: "You are an agent.",
        temperature: 0.2,
        timeoutMs: 30_000,
      })

      expect(mockChatWithOllama).toHaveBeenCalledWith(
        "gemma3:4b",
        "What next?",
        "You are an agent.",
        30_000,
        0.2
      )
      expect(result).toBe('{"type":"navigate","description":"go"}')
    })

    it("passes undefined temperature and timeoutMs through", async () => {
      mockChatWithOllama.mockResolvedValueOnce("ok")
      await adapter.chat({ model: "gemma3:4b", prompt: "hi" })
      expect(mockChatWithOllama).toHaveBeenCalledWith(
        "gemma3:4b", "hi", undefined, undefined, undefined
      )
    })

    it("propagates errors from chatWithOllama", async () => {
      mockChatWithOllama.mockRejectedValueOnce(new Error("Ollama timed out"))
      await expect(adapter.chat({ model: "gemma3:4b", prompt: "hi" })).rejects.toThrow("Ollama timed out")
    })
  })

  describe("ping()", () => {
    it("returns true when pingOllama returns true", async () => {
      mockPingOllama.mockResolvedValueOnce(true)
      expect(await adapter.ping()).toBe(true)
    })

    it("returns false when pingOllama returns false", async () => {
      mockPingOllama.mockResolvedValueOnce(false)
      expect(await adapter.ping()).toBe(false)
    })
  })

  describe("listModels()", () => {
    it("returns the models from listModels()", async () => {
      mockListModels.mockResolvedValueOnce(["gemma3:4b", "llama3:8b"])
      expect(await adapter.listModels()).toEqual(["gemma3:4b", "llama3:8b"])
    })

    it("returns empty array when listModels returns []", async () => {
      mockListModels.mockResolvedValueOnce([])
      expect(await adapter.listModels()).toEqual([])
    })
  })
})

// ── VLLMAdapter ────────────────────────────────────────────────────────────────

describe("VLLMAdapter", () => {
  const BASE_URL = "http://vllm-test:8000"
  const adapter = new VLLMAdapter(BASE_URL)

  describe("chat()", () => {
    it("sends OpenAI-compatible chat completion request", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ choices: [{ message: { content: "navigate to page" } }] })
      )

      const result = await adapter.chat({
        model: "gemma-3-4b",
        prompt: "What next?",
        systemPrompt: "You are an agent.",
      })

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`${BASE_URL}/v1/chat/completions`)
      expect(init.method).toBe("POST")

      const requestBody = JSON.parse(init.body as string) as {
        model: string
        messages: { role: string; content: string }[]
        stream: boolean
      }
      expect(requestBody.model).toBe("gemma-3-4b")
      expect(requestBody.stream).toBe(false)
      expect(requestBody.messages).toEqual([
        { role: "system", content: "You are an agent." },
        { role: "user", content: "What next?" },
      ])
      expect(result).toBe("navigate to page")
    })

    it("omits system message when systemPrompt is not provided", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ choices: [{ message: { content: "done" } }] })
      )

      await adapter.chat({ model: "gemma-3-4b", prompt: "hi" })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as { messages: { role: string }[] }
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].role).toBe("user")
    })

    it("includes temperature in request body when provided", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ choices: [{ message: { content: "ok" } }] })
      )

      await adapter.chat({ model: "gemma-3-4b", prompt: "hi", temperature: 0.7 })

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(init.body as string) as { temperature?: number }
      expect(body.temperature).toBe(0.7)
    })

    it("returns empty string when response content is missing", async () => {
      mockFetch.mockResolvedValueOnce(makeJsonResponse({ choices: [{}] }))
      const result = await adapter.chat({ model: "gemma-3-4b", prompt: "hi" })
      expect(result).toBe("")
    })

    it("throws on non-2xx HTTP response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })
      )
      await expect(
        adapter.chat({ model: "gemma-3-4b", prompt: "hi" })
      ).rejects.toThrow("vLLM 500")
    })

    it("propagates fetch errors (e.g. network timeout)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("AbortError"))
      await expect(adapter.chat({ model: "gemma-3-4b", prompt: "hi" })).rejects.toThrow("AbortError")
    })
  })

  describe("ping()", () => {
    it("returns true when /health returns 200", async () => {
      mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }))
      expect(await adapter.ping()).toBe(true)
      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toBe(`${BASE_URL}/health`)
    })

    it("returns false when /health returns non-200", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", { status: 503 }))
      expect(await adapter.ping()).toBe(false)
    })

    it("returns false on fetch error (server unreachable)", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))
      expect(await adapter.ping()).toBe(false)
    })
  })

  describe("listModels()", () => {
    it("returns model IDs from /v1/models", async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse({ data: [{ id: "gemma-3-4b" }, { id: "llama-3-8b" }] })
      )
      expect(await adapter.listModels()).toEqual(["gemma-3-4b", "llama-3-8b"])
      const [url] = mockFetch.mock.calls[0] as [string]
      expect(url).toBe(`${BASE_URL}/v1/models`)
    })

    it("returns empty array on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(new Response("", { status: 401 }))
      expect(await adapter.listModels()).toEqual([])
    })

    it("returns empty array on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"))
      expect(await adapter.listModels()).toEqual([])
    })
  })
})

// ── factory ────────────────────────────────────────────────────────────────────

describe("getInferenceAdapter (factory)", () => {
  it("returns OllamaAdapter when vllm-backend flag is OFF", async () => {
    mockEvaluateFlag.mockResolvedValueOnce(false)
    const adapter = await getInferenceAdapter()
    expect(adapter).toBeInstanceOf(OllamaAdapter)
    expect(mockEvaluateFlag).toHaveBeenCalledWith(
      VLLM_BACKEND_FLAG,
      { schoolId: null, plan: null }
    )
  })

  it("returns VLLMAdapter when vllm-backend flag is ON", async () => {
    mockEvaluateFlag.mockResolvedValueOnce(true)
    const adapter = await getInferenceAdapter()
    expect(adapter).toBeInstanceOf(VLLMAdapter)
  })

  it("passes schoolId to evaluateFlag when provided", async () => {
    mockEvaluateFlag.mockResolvedValueOnce(false)
    await getInferenceAdapter("school-abc")
    expect(mockEvaluateFlag).toHaveBeenCalledWith(
      VLLM_BACKEND_FLAG,
      { schoolId: "school-abc", plan: null }
    )
  })

  it("defaults to OllamaAdapter (flag eval returns false by default for unknown flags)", async () => {
    // evaluateFlag returns false for unknown flags — OllamaAdapter is the safe default
    mockEvaluateFlag.mockResolvedValueOnce(false)
    const adapter = await getInferenceAdapter()
    expect(adapter).toBeInstanceOf(OllamaAdapter)
  })
})
