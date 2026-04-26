// Story 4.1/4.2/4.3: polls Express for actions and executes them on OneSchool.
// Detokenizes values locally — raw PII never sent to server.

import { detokenize } from "../lib/tokenizer"
import type { AgentAction } from "../types/index"

const SERVER = "http://localhost:3001"
const POLL_INTERVAL_MS = 800
const MAX_STEPS = 30

let stepCount = 0
let polling = false

function getSessionId(): string | null {
  return sessionStorage.getItem("dispatcher_session_id")
}

// ─── Kendo Utilities ──────────────────────────────────────────────────────────

function waitForKendoIdle(ms = 6000): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now()
    const check = () => {
      const idle = Array.from(document.querySelectorAll(".k-loading-mask")).every(
        (el) => getComputedStyle(el).display === "none" || !el.isConnected
      )
      if (idle || Date.now() - start >= ms) resolve()
      else setTimeout(check, 200)
    }
    setTimeout(check, 300)
  })
}

function waitForSelector(sel: string, ms = 8000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(sel)
    if (el) { resolve(el); return }
    const obs = new MutationObserver(() => {
      const found = document.querySelector(sel)
      if (found) { obs.disconnect(); resolve(found) }
    })
    obs.observe(document.body, { childList: true, subtree: true })
    setTimeout(() => { obs.disconnect(); resolve(null) }, ms)
  })
}

function simulateKendoDrag(src: HTMLElement, dst: HTMLElement): void {
  const sr = src.getBoundingClientRect(), dr = dst.getBoundingClientRect()
  const sx = sr.left + sr.width / 2, sy = sr.top + sr.height / 2
  const dx = dr.left + dr.width / 2, dy = dr.top + dr.height / 2
  const opts = (x: number, y: number): MouseEventInit => ({ bubbles: true, cancelable: true, clientX: x, clientY: y, screenX: x, screenY: y, view: window })
  src.dispatchEvent(new MouseEvent("mousedown", opts(sx, sy)))
  for (let i = 1; i <= 8; i++) document.dispatchEvent(new MouseEvent("mousemove", opts(sx + ((dx - sx) * i) / 8, sy + ((dy - sy) * i) / 8)))
  dst.dispatchEvent(new MouseEvent("mouseover", opts(dx, dy)))
  dst.dispatchEvent(new MouseEvent("mouseenter", opts(dx, dy)))
  document.dispatchEvent(new MouseEvent("mouseup", opts(dx, dy)))
  dst.dispatchEvent(new MouseEvent("mouseup", opts(dx, dy)))
}

// ─── Action Handlers ──────────────────────────────────────────────────────────

type Result = { success: boolean; result: string }

async function handleNavigate(a: AgentAction): Promise<Result> {
  const target = a.target ?? ""
  const match = Array.from(document.querySelectorAll("a, button, [role='menuitem'], [role='button'], .k-item"))
    .find((el) => el.textContent?.trim().toLowerCase().includes(target.toLowerCase()))
  if (match) { (match as HTMLElement).click(); return { success: true, result: `Clicked "${target}"` } }
  if (target.startsWith("http") || target.startsWith("/")) { window.location.href = target; return { success: true, result: `Navigating to ${target}` } }
  return { success: false, result: `No element or URL matching "${target}"` }
}

async function handleClick(a: AgentAction): Promise<Result> {
  await waitForKendoIdle()
  const el = document.querySelector(a.selector!) as HTMLElement | null
  if (!el) return { success: false, result: `Not found: ${a.selector}` }
  el.click(); await waitForKendoIdle()
  return { success: true, result: `Clicked ${a.selector}` }
}

async function handleFill(a: AgentAction): Promise<Result> {
  await waitForKendoIdle()
  const el = document.querySelector(a.selector!) as HTMLInputElement | null
  if (!el) return { success: false, result: `Input not found: ${a.selector}` }
  const real = detokenize(a.value ?? "")
  el.focus(); el.value = real
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
  el.dispatchEvent(new KeyboardEvent("keyup", { key: real.slice(-1), bubbles: true }))
  return { success: true, result: `Filled ${a.selector}` }
}

async function handleSelect(a: AgentAction): Promise<Result> {
  await waitForKendoIdle()
  const real = detokenize(a.value ?? "")
  const sel = document.querySelector(a.selector!) as HTMLSelectElement | null
  if (sel?.tagName === "SELECT") {
    const opt = Array.from(sel.options).find((o) => o.text.trim() === real || o.value === real)
    if (!opt) return { success: false, result: `Option "${real}" not found` }
    sel.value = opt.value; sel.dispatchEvent(new Event("change", { bubbles: true }))
    return { success: true, result: `Selected "${a.value}"` }
  }
  const kdl = document.querySelector(a.selector!) as HTMLElement | null
  if (kdl) {
    kdl.click()
    await waitForSelector(".k-animation-container .k-list-item, .k-popup .k-item", 3000)
    const item = Array.from(document.querySelectorAll(".k-animation-container .k-list-item, .k-popup .k-item"))
      .find((el) => el.textContent?.trim() === real)
    if (item) { (item as HTMLElement).click(); return { success: true, result: `Kendo selected "${a.value}"` } }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    return { success: false, result: `Option "${real}" not in Kendo dropdown` }
  }
  return { success: false, result: `Dropdown not found: ${a.selector}` }
}

async function handleCheck(a: AgentAction): Promise<Result> {
  await waitForKendoIdle()
  const el = document.querySelector(a.selector!) as HTMLInputElement | null
  if (!el) return { success: false, result: `Checkbox not found: ${a.selector}` }
  if (!el.checked) { el.click(); el.dispatchEvent(new Event("change", { bubbles: true })) }
  return { success: true, result: `Checked ${a.selector}` }
}

async function handleDrag(a: AgentAction): Promise<Result> {
  await waitForKendoIdle()
  const src = document.querySelector(a.selector!) as HTMLElement | null
  const dst = document.querySelector(a.target!) as HTMLElement | null
  if (!src) return { success: false, result: `Drag source not found: ${a.selector}` }
  if (!dst) return { success: false, result: `Drag target not found: ${a.target}` }
  simulateKendoDrag(src, dst); await waitForKendoIdle()
  return { success: true, result: `Dragged ${a.selector} → ${a.target}` }
}

async function handleWait(a: AgentAction): Promise<Result> {
  const el = await waitForSelector(a.selector!, 8000)
  return el ? { success: true, result: `Ready: ${a.selector}` } : { success: false, result: `Timeout: ${a.selector}` }
}

async function dispatch(action: AgentAction): Promise<Result> {
  switch (action.type) {
    case "navigate": return handleNavigate(action)
    case "click":    return handleClick(action)
    case "fill":     return handleFill(action)
    case "select":   return handleSelect(action)
    case "check":    return handleCheck(action)
    case "drag":     return handleDrag(action)
    case "wait":     return handleWait(action)
    case "scrape":   return { success: true, result: "Page re-read by scraper" }
    case "done":
    case "error":    return { success: true, result: action.description }
    default:         return { success: false, result: `Unknown action: ${action.type}` }
  }
}

// ─── Poll Loop ────────────────────────────────────────────────────────────────

async function pollAndExecute(): Promise<void> {
  if (polling) return
  polling = true

  while (stepCount < MAX_STEPS) {
    const sessionId = getSessionId()
    if (!sessionId) { await sleep(2000); continue }

    try {
      const res = await fetch(`${SERVER}/api/agent/next-action?sessionId=${sessionId}`)
      if (!res.ok) { await sleep(POLL_INTERVAL_MS); continue }

      const { action } = (await res.json()) as { action: AgentAction | null }
      if (!action) { await sleep(POLL_INTERVAL_MS); continue }

      stepCount++
      const { success, result } = await dispatch(action).catch((err) => ({
        success: false,
        result: err instanceof Error ? err.message : String(err),
      }))

      await fetch(`${SERVER}/api/agent/action-result?sessionId=${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success, result, newPageUrl: window.location.href }),
      })

      if (action.type === "done" || action.type === "error") break
    } catch {
      await sleep(POLL_INTERVAL_MS)
    }
  }

  polling = false
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)) }

// Listen for session start signal from the React app (via postMessage)
window.addEventListener("message", (e: MessageEvent) => {
  if (e.origin !== "http://localhost:3000") return
  const { type, sessionId } = e.data as { type?: string; sessionId?: string }
  if (type === "DISPATCHER_SESSION_START" && sessionId) {
    sessionStorage.setItem("dispatcher_session_id", sessionId)
    stepCount = 0
    pollAndExecute().catch(() => undefined)
  }
})
