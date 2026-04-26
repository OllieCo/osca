// PII tokenizer — sessionStorage-scoped, clears on tab close.
// Shared origin: MySchool tokenizer.ts — identical logic.

import type { FieldType, TokenMap } from "../types/index"

const TOKEN_MAP_KEY = "dispatcher_token_map"
const TOKEN_CTR_KEY = "dispatcher_token_counters"
const TOKEN_RE = /\[([A-Z]+)_(\d{3})\]/g

type TokenCounters = Partial<Record<string, number>>

function loadMap(): TokenMap {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_MAP_KEY) ?? "{}") as TokenMap }
  catch { return {} }
}

function loadCounters(): TokenCounters {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_CTR_KEY) ?? "{}") as TokenCounters }
  catch { return {} }
}

function saveMap(map: TokenMap): void {
  sessionStorage.setItem(TOKEN_MAP_KEY, JSON.stringify(map))
}

function saveCounters(c: TokenCounters): void {
  sessionStorage.setItem(TOKEN_CTR_KEY, JSON.stringify(c))
}

// Returns a [TYPE_###] token — deterministic within the session.
export function tokenize(value: string, fieldType: FieldType): string {
  const trimmed = value.trim()
  if (!trimmed) return value

  const map = loadMap()
  const existing = Object.entries(map).find(([, v]) => v === trimmed)
  if (existing) return existing[0]

  const counters = loadCounters()
  const prefix = fieldType.toUpperCase()
  counters[prefix] = (counters[prefix] ?? 0) + 1
  const token = `[${prefix}_${String(counters[prefix]).padStart(3, "0")}]`

  map[token] = trimmed
  saveMap(map)
  saveCounters(counters)
  return token
}

// Replaces [TYPE_###] tokens with original values — for display only, never transmit.
export function detokenize(text: string): string {
  const map = loadMap()
  TOKEN_RE.lastIndex = 0
  return text.replace(TOKEN_RE, (match) => map[match] ?? match)
}

export function getTokenMap(): Readonly<TokenMap> { return loadMap() }
export function tokenMapSize(): number { return Object.keys(loadMap()).length }

// Called on session end — satisfies success criterion "token map cleared on session end"
export function clearTokenMap(): void {
  sessionStorage.removeItem(TOKEN_MAP_KEY)
  sessionStorage.removeItem(TOKEN_CTR_KEY)
}
