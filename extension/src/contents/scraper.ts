// Story 2.2: content script that scrapes OneSchool and POSTs to Express :3001.
// rawValue is blanked before sending — PII never leaves the browser tab.

import { tokenize } from "../lib/tokenizer"
import { extractAllTables } from "../lib/scraper"
import type { ScrapedRecord } from "../types/index"

const SERVER = "http://localhost:3001"
const PROGRESS_ID = "dispatcher-scrape-progress"

// Session ID is stored per tab in sessionStorage so scrapes correlate to agent runs.
function getSessionId(): string | null {
  return sessionStorage.getItem("dispatcher_session_id")
}

function showScrapeProgress(loaded: number, total: number): void {
  let el = document.getElementById(PROGRESS_ID)
  if (!el) {
    el = document.createElement("div")
    el.id = PROGRESS_ID
    el.style.cssText = [
      "position:fixed", "top:12px", "right:12px", "z-index:999999",
      "background:#1e3a5f", "color:#fff",
      "font:13px/1.4 system-ui,sans-serif",
      "padding:8px 14px", "border-radius:6px",
      "box-shadow:0 2px 8px rgba(0,0,0,.3)",
      "pointer-events:none",
    ].join(";")
    document.body?.appendChild(el)
  }
  el.textContent = total > 0
    ? `Dispatcher: loading table… ${loaded} / ${total} rows`
    : `Dispatcher: loading table… ${loaded} rows`
}

function hideScrapeProgress(): void {
  document.getElementById(PROGRESS_ID)?.remove()
}

async function scrapeAndPost(): Promise<void> {
  const sessionId = getSessionId()
  if (!sessionId) return  // no active session — skip

  await waitForKendoReady()

  const { fields, tableData } = await extractAllTables(
    document,
    tokenize,
    (_gridId, loaded, total) => showScrapeProgress(loaded, total)
  )
  hideScrapeProgress()

  // Belt-and-suspenders: blank rawValue before sending
  const safeFields = fields.map(({ rawValue: _pii, ...rest }) => ({ ...rest, rawValue: "" }))

  const record: ScrapedRecord = {
    url: window.location.href,
    timestamp: Date.now(),
    classification: "OFFICIAL:Sensitive",
    fields: safeFields,
    tableData,
  }

  try {
    await fetch(`${SERVER}/api/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, record }),
    })
  } catch {
    // Server not running — silent fail for PoC
  }
}

function waitForKendoReady(timeoutMs = 6_000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const masks = Array.from(document.querySelectorAll(".k-grid .k-loading-mask"))
      const idle = masks.every((el) => getComputedStyle(el).display === "none" || !el.isConnected)
      const hasRows = document.querySelector(".k-grid-content tbody tr, .k-virtual-scrollable-wrap tbody tr") !== null
      if ((idle && hasRows) || Date.now() - start >= timeoutMs) resolve()
      else setTimeout(check, 200)
    }
    setTimeout(check, 400)
  })
}

// Scrape on every page load
scrapeAndPost().catch(() => undefined)
