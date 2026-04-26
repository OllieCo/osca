// Identical to client/src/lib/tokenizer.ts — shared origin, copied for extension isolation.
// Uses sessionStorage so PII clears on tab close.

import type { FieldType, TokenMap } from "../types/index"

const TOKEN_MAP_KEY = "dispatcher_token_map"
const TOKEN_CTR_KEY = "dispatcher_token_counters"
const TOKEN_RE = /\[([A-Z]+)_(\d{3})\]/g
type TokenCounters = Partial<Record<string, number>>

function loadMap(): TokenMap {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_MAP_KEY) ?? "{}") as TokenMap } catch { return {} }
}
function loadCounters(): TokenCounters {
  try { return JSON.parse(sessionStorage.getItem(TOKEN_CTR_KEY) ?? "{}") as TokenCounters } catch { return {} }
}
function saveMap(m: TokenMap) { sessionStorage.setItem(TOKEN_MAP_KEY, JSON.stringify(m)) }
function saveCounters(c: TokenCounters) { sessionStorage.setItem(TOKEN_CTR_KEY, JSON.stringify(c)) }

export function tokenize(value: string, fieldType: FieldType): string {
  const trimmed = value.trim(); if (!trimmed) return value
  const map = loadMap()
  const existing = Object.entries(map).find(([, v]) => v === trimmed)
  if (existing) return existing[0]
  const counters = loadCounters(); const prefix = fieldType.toUpperCase()
  counters[prefix] = (counters[prefix] ?? 0) + 1
  const token = `[${prefix}_${String(counters[prefix]).padStart(3, "0")}]`
  map[token] = trimmed; saveMap(map); saveCounters(counters); return token
}

export function detokenize(text: string): string {
  const map = loadMap(); TOKEN_RE.lastIndex = 0
  return text.replace(TOKEN_RE, (match) => map[match] ?? match)
}

export function clearTokenMap(): void {
  sessionStorage.removeItem(TOKEN_MAP_KEY); sessionStorage.removeItem(TOKEN_CTR_KEY)
}
