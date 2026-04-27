// OneSchool scraping functions — Kendo grid, HTML table, and form field extraction.
//
// All CSS selectors are imported from selectors.ts (DOM Resilience Epic 1 Story 1.1).
// Add a selector there before using it here.

import type { ScrapedField, ScrapedTable, TableMeta, PageInfo, FieldType } from "../types/index"
import {
  KENDO_GRID,
  KENDO_DETAIL_CELL,
  KENDO_HEADER_CELLS,
  KENDO_COLUMN_TITLE,
  KENDO_HIERARCHY_CELL,
  KENDO_PAGER_INFO,
  KENDO_CONTENT_AREA,
  KENDO_GRID_CONTENT,
  KENDO_VIRTUAL_WRAP,
  KENDO_DATA_ROWS,
  KENDO_EXCLUDED_CELLS,
  KENDO_LOADING_MASK,
  FORM_LABEL_FOR,
  FORM_DL_DT,
  FORM_DL_DD,
  FORM_TABLE_ROW,
} from "./selectors"

// ─── PII Classification ───────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g
const PHONE_RE = /(\+?61\s?)?(\(0\d\)\s?|0\d\s?)?\d{4}\s?\d{4}/g
const TFN_RE = /\b\d{3}\s\d{3}\s\d{3}\b|\b\d{8,9}\b/g
const ABN_RE = /\b\d{2}\s\d{3}\s\d{3}\s\d{3}\b/g
// EQ ID: 10 digits followed by exactly 1 letter (e.g. 1234567890A) — CONFIRMED against OneSchool TRAIN
const EQ_ID_RE = /\b\d{10}[A-Za-z]\b/g
// EQ Staff Employee ID: 5 letters followed by exactly 1 digit (e.g. SMITJ1) — CONFIRMED against OneSchool TRAIN
const STAFF_ID_RE = /\b[A-Za-z]{5}\d\b/g

export function classifyField(label: string, value: string): FieldType {
  const l = label.toLowerCase()
  if (/\bqsn\b|\beq\s*id\b|student\s*number|student\s*id/i.test(l)) return "qsn"
  if (/\bstaff\s*id\b|\bemployee\s*(id|number)\b|\bpayroll\s*(#|number|no\.?)?/i.test(l)) return "staffid"
  if (/\btfn\b|tax\s*file/i.test(l)) return "tfn"
  if (/\babn\b|business\s*number/i.test(l)) return "abn"
  if (/\bname\b|surname|given\s*name|first\s*name|last\s*name|full\s*name/i.test(l)) return "name"
  if (/email|e-mail/i.test(l)) return "email"
  if (/phone|mobile|fax|contact\s*number/i.test(l)) return "phone"
  if (/\bdob\b|date\s*of\s*birth|birth\s*date|born/i.test(l)) return "dob"
  if (/address|street|suburb|postcode|state|locality/i.test(l)) return "address"
  if (/\bid\b|identifier|\bnumber\b|ref|case|file|record/i.test(l)) return "id"

  EMAIL_RE.lastIndex = 0; ABN_RE.lastIndex = 0; TFN_RE.lastIndex = 0; PHONE_RE.lastIndex = 0
  EQ_ID_RE.lastIndex = 0; STAFF_ID_RE.lastIndex = 0
  if (EQ_ID_RE.test(value)) return "qsn"
  if (STAFF_ID_RE.test(value)) return "staffid"
  if (EMAIL_RE.test(value)) return "email"
  if (ABN_RE.test(value)) return "abn"
  if (TFN_RE.test(value)) return "tfn"
  if (PHONE_RE.test(value)) return "phone"
  return "unknown"
}

// ─── Kendo Grid Extraction ────────────────────────────────────────────────────

function extractKendoHeaders(grid: Element): string[] {
  const headers: string[] = []
  grid.querySelectorAll(KENDO_HEADER_CELLS.selector).forEach((th) => {
    if (th.classList.contains(KENDO_HIERARCHY_CELL.selector.replace(".", ""))) return
    const title = (th.querySelector(KENDO_COLUMN_TITLE.selector) ?? th).textContent?.trim() ?? ""
    if (title) headers.push(title)
  })
  return headers
}

function extractKendoPager(grid: Element): PageInfo | undefined {
  const infoText = grid.querySelector(KENDO_PAGER_INFO.selector)?.textContent?.trim() ?? ""
  const match = infoText.match(/(\d[\d,]*)\s*-\s*(\d[\d,]*)\s*of\s*(\d[\d,]*)/i)
  if (!match) return undefined
  const parse = (s: string) => parseInt(s.replace(/,/g, ""), 10)
  return { currentStart: parse(match[1]), currentEnd: parse(match[2]), total: parse(match[3]), hasMore: parse(match[2]) < parse(match[3]) }
}

function extractKendoRows(grid: Element, headers: string[], tokenizeFn: (v: string, t: FieldType) => string): string[][] {
  const rows: string[][] = []
  const contentEl = grid.querySelector(KENDO_CONTENT_AREA.selector)
  if (!contentEl) return rows

  contentEl.querySelectorAll(KENDO_DATA_ROWS.selector).forEach((tr) => {
    const cells: string[] = []
    let col = 0
    tr.querySelectorAll("td").forEach((td) => {
      if (
        td.classList.contains("k-hierarchy-cell") ||
        td.classList.contains("k-group-cell")
      ) return
      const raw = td.textContent?.trim() ?? ""
      cells.push(raw ? tokenizeFn(raw, classifyField(headers[col] ?? "", raw)) : "")
      col++
    })
    if (cells.some((c) => c !== "")) rows.push(cells)
  })
  return rows
}

// ─── Virtual Scroll Accumulation ─────────────────────────────────────────────

function extractRawRows(grid: Element): string[][] {
  const contentEl = grid.querySelector(KENDO_CONTENT_AREA.selector)
  if (!contentEl) return []
  const rows: string[][] = []
  contentEl.querySelectorAll(KENDO_DATA_ROWS.selector).forEach((tr) => {
    const cells: string[] = []
    tr.querySelectorAll("td").forEach((td) => {
      if (
        td.classList.contains("k-hierarchy-cell") ||
        td.classList.contains("k-group-cell")
      ) return
      cells.push(td.textContent?.trim() ?? "")
    })
    if (cells.some((c) => c !== "")) rows.push(cells)
  })
  return rows
}

function waitForKendoIdleMs(grid: Element, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const mask = grid.querySelector(KENDO_LOADING_MASK.selector)
      const idle = !mask || getComputedStyle(mask).display === "none" || !mask.isConnected
      if (idle || Date.now() - start >= timeoutMs) resolve()
      else setTimeout(check, 100)
    }
    setTimeout(check, 100)
  })
}

// Scrolls a Kendo virtual grid to accumulate all rows that the virtualiser recycles out of the DOM.
// Falls through to a synchronous single-pass for non-virtual grids.
export async function scrollAndAccumulateRows(
  grid: Element,
  headers: string[],
  tokenizeFn: (v: string, t: FieldType) => string,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ rows: string[][]; fullyLoaded: boolean }> {
  const wrap = grid.querySelector<HTMLElement>(KENDO_VIRTUAL_WRAP.selector)
  if (!wrap) {
    return { rows: extractKendoRows(grid, headers, tokenizeFn), fullyLoaded: true }
  }

  const pageInfo = extractKendoPager(grid)
  const total = pageInfo?.total ?? 0

  // Use raw cell text joined as dedup key; store the tokenised version
  const seen = new Set<string>()
  const accumulated: string[][] = []

  const capture = () => {
    for (const rawRow of extractRawRows(grid)) {
      const key = rawRow.join("\x00")
      if (seen.has(key)) continue
      seen.add(key)
      accumulated.push(rawRow.map((v, i) => v ? tokenizeFn(v, classifyField(headers[i] ?? "", v)) : ""))
    }
    onProgress?.(accumulated.length, total)
  }

  let prevCount = -1
  let stableRounds = 0
  const MAX_STABLE = 3   // stop after 3 iterations with no new rows
  const MAX_ITERATIONS = 200

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    capture()

    if (accumulated.length === prevCount) {
      stableRounds++
      if (stableRounds >= MAX_STABLE) break
    } else {
      stableRounds = 0
    }
    prevCount = accumulated.length

    const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 2
    if (atBottom) {
      // Final capture after reaching the bottom before restoring position
      await waitForKendoIdleMs(grid)
      capture()
      break
    }

    wrap.scrollTop += wrap.clientHeight
    await waitForKendoIdleMs(grid)
  }

  // Restore scroll to top so the user sees the grid from row 1
  wrap.scrollTop = 0

  return {
    rows: accumulated,
    fullyLoaded: total === 0 || accumulated.length >= total,
  }
}

export async function extractKendoGrids(
  root: Document | Element,
  tokenizeFn: (v: string, t: FieldType) => string,
  onProgress?: (gridId: string | undefined, loaded: number, total: number) => void
): Promise<ScrapedTable[]> {
  const tables: ScrapedTable[] = []
  const grids = Array.from(root.querySelectorAll<Element>(KENDO_GRID.selector)).filter(
    (g) => !g.closest(KENDO_DETAIL_CELL.selector)
  )

  for (const grid of grids) {
    const headers = extractKendoHeaders(grid)
    const pageInfo = extractKendoPager(grid)
    const isVirtual = grid.querySelector(KENDO_VIRTUAL_WRAP.selector) !== null
    const gridId = (grid as HTMLElement).id || undefined

    let rows: string[][]
    let hasMore = pageInfo?.hasMore ?? false

    if (isVirtual) {
      const progress = onProgress
        ? (loaded: number, total: number) => onProgress(gridId, loaded, total)
        : undefined
      const result = await scrollAndAccumulateRows(grid, headers, tokenizeFn, progress)
      rows = result.rows
      if (result.fullyLoaded) hasMore = false
    } else {
      rows = extractKendoRows(grid, headers, tokenizeFn)
    }

    const meta: TableMeta = {
      source: "kendo",
      isVirtual,
      gridId,
      pageInfo: pageInfo ? { ...pageInfo, hasMore } : undefined,
    }
    if (headers.length > 0 || rows.length > 0) tables.push({ headers, rows, meta })
  }
  return tables
}

// ─── HTML Table Extraction ────────────────────────────────────────────────────

export function extractHtmlTables(
  root: Document | Element,
  tokenizeFn: (v: string, t: FieldType) => string
): ScrapedTable[] {
  const tables: ScrapedTable[] = []
  root.querySelectorAll("table").forEach((table) => {
    if (table.closest(KENDO_GRID.selector)) return
    const headers: string[] = []
    table.querySelectorAll("thead th, thead td").forEach((th) => headers.push(th.textContent?.trim() ?? ""))
    if (headers.length === 0) table.querySelector("tr")?.querySelectorAll("th").forEach((th) => headers.push(th.textContent?.trim() ?? ""))

    const rows: string[][] = []
    table.querySelectorAll("tbody tr, tr:not(thead tr):not(:first-child)").forEach((tr) => {
      if (!tr.querySelector("td")) return
      const cells: string[] = []
      tr.querySelectorAll("td").forEach((td, i) => {
        const raw = td.textContent?.trim() ?? ""
        cells.push(raw ? tokenizeFn(raw, classifyField(headers[i] ?? "", raw)) : "")
      })
      if (cells.some((c) => c !== "")) rows.push(cells)
    })
    if (headers.length > 0 || rows.length > 0) tables.push({ headers, rows, meta: { source: "html", isVirtual: false } })
  })
  return tables
}

// ─── Form Field Extraction ────────────────────────────────────────────────────

export function extractFormFields(
  root: Document | Element,
  tokenizeFn: (v: string, t: FieldType) => string
): ScrapedField[] {
  const fields: ScrapedField[] = []

  root.querySelectorAll(FORM_LABEL_FOR.selector).forEach((label) => {
    const control = root.querySelector(`#${CSS.escape(label.getAttribute("for")!)}`)
    if (!control) return
    const labelText = label.textContent?.trim() ?? ""
    const rawValue = ((control as HTMLInputElement).value?.trim() || control.textContent?.trim() || "")
    if (!rawValue || !labelText) return
    const fieldType = classifyField(labelText, rawValue)
    fields.push({ label: labelText, rawValue, tokenizedValue: tokenizeFn(rawValue, fieldType), fieldType })
  })

  root.querySelectorAll("dl").forEach((dl) => {
    const dts = Array.from(dl.querySelectorAll(FORM_DL_DT.selector))
    const dds = Array.from(dl.querySelectorAll(FORM_DL_DD.selector))
    dts.forEach((dt, i) => {
      const dd = dds[i]; if (!dd) return
      const labelText = dt.textContent?.trim() ?? ""; const rawValue = dd.textContent?.trim() ?? ""
      if (!rawValue || !labelText) return
      const fieldType = classifyField(labelText, rawValue)
      fields.push({ label: labelText, rawValue, tokenizedValue: tokenizeFn(rawValue, fieldType), fieldType })
    })
  })

  root.querySelectorAll(FORM_TABLE_ROW.selector).forEach((tr) => {
    const th = tr.querySelector("th"); const td = tr.querySelector("td")
    if (!th || !td) return
    const labelText = th.textContent?.trim() ?? ""; const rawValue = td.textContent?.trim() ?? ""
    if (!rawValue || !labelText) return
    const fieldType = classifyField(labelText, rawValue)
    fields.push({ label: labelText, rawValue, tokenizedValue: tokenizeFn(rawValue, fieldType), fieldType })
  })

  const seen = new Set<string>()
  return fields.filter((f) => { const k = `${f.label}::${f.rawValue}`; if (seen.has(k)) return false; seen.add(k); return true })
}

// ─── Combined Entry Point ─────────────────────────────────────────────────────

export async function extractAllTables(
  root: Document | Element,
  tokenizeFn: (v: string, t: FieldType) => string,
  onProgress?: (gridId: string | undefined, loaded: number, total: number) => void
): Promise<{ fields: ScrapedField[]; tableData: ScrapedTable[] }> {
  return {
    fields: extractFormFields(root, tokenizeFn),
    tableData: [
      ...(await extractKendoGrids(root, tokenizeFn, onProgress)),
      ...extractHtmlTables(root, tokenizeFn),
    ],
  }
}
