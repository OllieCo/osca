import { describe, it, expect, beforeEach } from "vitest"
import { tokenize, detokenize, clearTokenMap, tokenMapSize } from "./tokenizer"

beforeEach(() => clearTokenMap())

describe("tokenize", () => {
  it("returns a [TYPE_###] token for a non-empty value", () => {
    const t = tokenize("John Smith", "name")
    expect(t).toMatch(/^\[NAME_\d{3}\]$/)
  })

  it("is deterministic — same value returns same token", () => {
    const t1 = tokenize("John Smith", "name")
    const t2 = tokenize("John Smith", "name")
    expect(t1).toBe(t2)
  })

  it("assigns different tokens to different values", () => {
    const t1 = tokenize("John Smith", "name")
    const t2 = tokenize("Jane Doe", "name")
    expect(t1).not.toBe(t2)
  })

  it("increments counter per prefix", () => {
    const t1 = tokenize("Alice", "name")
    const t2 = tokenize("Bob", "name")
    expect(t1).toBe("[NAME_001]")
    expect(t2).toBe("[NAME_002]")
  })

  it("uses separate counters for different field types", () => {
    const name = tokenize("John", "name")
    const email = tokenize("john@example.com", "email")
    expect(name).toBe("[NAME_001]")
    expect(email).toBe("[EMAIL_001]")
  })

  it("returns the original value when trimmed is empty", () => {
    expect(tokenize("", "name")).toBe("")
    expect(tokenize("   ", "name")).toBe("   ")
  })

  it("trims whitespace before tokenizing", () => {
    const t1 = tokenize("  John  ", "name")
    const t2 = tokenize("John", "name")
    expect(t1).toBe(t2)
  })
})

describe("detokenize", () => {
  it("replaces a known token with its original value", () => {
    tokenize("John Smith", "name")
    expect(detokenize("[NAME_001]")).toBe("John Smith")
  })

  it("leaves unknown tokens unchanged", () => {
    expect(detokenize("[NAME_999]")).toBe("[NAME_999]")
  })

  it("replaces multiple tokens in one string", () => {
    tokenize("Alice", "name")
    tokenize("bob@example.com", "email")
    const result = detokenize("Hello [NAME_001], email us at [EMAIL_001]")
    expect(result).toBe("Hello Alice, email us at bob@example.com")
  })
})

describe("clearTokenMap", () => {
  it("removes all tokens so the map is empty", () => {
    tokenize("John", "name")
    expect(tokenMapSize()).toBe(1)
    clearTokenMap()
    expect(tokenMapSize()).toBe(0)
  })

  it("resets counters so next token starts at 001", () => {
    tokenize("Alice", "name")
    clearTokenMap()
    const t = tokenize("Bob", "name")
    expect(t).toBe("[NAME_001]")
  })
})
