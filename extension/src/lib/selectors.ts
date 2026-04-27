/**
 * selectors.ts — DOM Resilience Epic 1 (Story 1.1 — Selector audit)
 *
 * Single source of truth for every CSS selector used to scrape and drive
 * the OneSchool (oslp.eq.edu.au) interface.
 *
 * Stability ratings:
 *   stable  — semantic HTML / ARIA roles unlikely to change without a major
 *              redesign.  Safe to rely on indefinitely.
 *   medium  — Kendo-framework class names.  Stable within a Kendo major
 *              version; expect changes on a Kendo upgrade (happens ~annually
 *              for OneSchool).  Monitor Kendo changelogs on every QLD DoE
 *              maintenance window.
 *   fragile — Internal/structural classes, attribute-value substring matches,
 *              or positional selectors.  High drift risk.  Consider replacing
 *              with a more stable alternative where noted.
 *
 * Every selector is referenced by name in scraper.ts / actor.ts so that:
 *  1. A grep for the constant name reveals every usage site.
 *  2. A future hot-patch channel can swap a single value without touching
 *     application logic.
 *  3. The fixture-diff script (scripts/fixture-diff.mjs) runs this registry
 *     against versioned HTML snapshots to flag regressions automatically.
 *
 * OneSchool Kendo version (observed): Kendo UI for jQuery 2023.x
 * Confirmed against: oslptrain.eq.edu.au (training environment)
 */

export type Stability = "stable" | "medium" | "fragile"

export interface SelectorEntry {
  /** The CSS selector string exactly as passed to querySelector / querySelectorAll. */
  readonly selector: string
  /** Drift-risk rating — see file header. */
  readonly stability: Stability
  /**
   * Human-readable risk note.  Answers: "what would break this?" and
   * "what is the recommended mitigation?"
   */
  readonly risk: string
  /** Source files that reference this selector. */
  readonly usedIn: readonly string[]
}

// ─── Kendo grid — structure ───────────────────────────────────────────────────

/**
 * Root grid element.  OneSchool renders every data table as a Kendo Grid.
 * The k-grid class is the single most stable marker — it's the public API
 * surface of the Kendo widget.
 */
export const KENDO_GRID: SelectorEntry = {
  selector: ".k-grid",
  stability: "stable",
  risk: "Would only break if QLD DoE stops using Kendo or upgrades to Kendo UI for Vue/React. Neither is expected before 2028.",
  usedIn: ["scraper.ts:extractKendoGrids"],
}

/**
 * Excludes nested grids (master-detail pattern) from top-level enumeration.
 * k-detail-cell is the wrapper around the inner grid in master-detail layouts.
 */
export const KENDO_DETAIL_CELL: SelectorEntry = {
  selector: ".k-detail-cell",
  stability: "medium",
  risk: "Kendo internal class. If Kendo renames this, nested grids may be double-counted. Mitigate: also check for aria-expanded on parent row.",
  usedIn: ["scraper.ts:extractKendoGrids"],
}

// ─── Kendo grid — headers ─────────────────────────────────────────────────────

/**
 * Header cell elements. In Kendo jQuery, every column header is a <th> with
 * k-header. Works on both paginated and virtual grids.
 */
export const KENDO_HEADER_CELLS: SelectorEntry = {
  selector: ".k-grid-header th.k-header",
  stability: "medium",
  risk: "k-header class is Kendo-internal. A Kendo major version bump could rename it. Fallback: thead th (broader but more stable).",
  usedIn: ["scraper.ts:extractKendoHeaders"],
}

/**
 * The span inside a header cell that holds the visible column label.
 * Falls back to full th.textContent if absent.
 */
export const KENDO_COLUMN_TITLE: SelectorEntry = {
  selector: ".k-column-title",
  stability: "medium",
  risk: "Introduced in Kendo 2019.x; absent in very old Kendo (pre-2019). OneSchool TRAIN confirmed present. Risk: zero for current, low for upgrades.",
  usedIn: ["scraper.ts:extractKendoHeaders"],
}

/**
 * Hierarchy cell — the expand/collapse toggle in master-detail grids.
 * Excluded from header and row extraction to avoid off-by-one column errors.
 */
export const KENDO_HIERARCHY_CELL: SelectorEntry = {
  selector: ".k-hierarchy-cell",
  stability: "medium",
  risk: "Kendo internal. If renamed, column offsets will shift and cell values will be attributed to wrong columns.",
  usedIn: ["scraper.ts:extractKendoHeaders", "scraper.ts:extractKendoRows"],
}

// ─── Kendo grid — pager ───────────────────────────────────────────────────────

/**
 * Pager summary text — e.g. "1 - 20 of 150 items".
 * Two variants to handle both old (.k-pager-wrap) and new (.k-grid-pager)
 * pager markup.  Kendo changed the wrapper class in 2021.x.
 */
export const KENDO_PAGER_INFO: SelectorEntry = {
  selector: ".k-pager-wrap .k-pager-info, .k-grid-pager .k-pager-info",
  stability: "medium",
  risk: "k-pager-info text format ('N - M of T items') is parsed via regex. If QLD DoE localises the string or Kendo changes the format, PITR will silently return 0. Add an alert in OBS when total=0 on a live page.",
  usedIn: ["scraper.ts:extractKendoPager"],
}

// ─── Kendo grid — content area ────────────────────────────────────────────────

/**
 * Content container for paginated grids.
 * k-grid-content is the scrollable div that wraps the tbody.
 */
export const KENDO_GRID_CONTENT: SelectorEntry = {
  selector: ".k-grid-content",
  stability: "medium",
  risk: "Standard Kendo class. Stable within Kendo 2019–2024 range. Risk increases on major Kendo upgrades.",
  usedIn: ["scraper.ts:scrollAndAccumulateRows"],
}

/**
 * Combined content-area selector: covers both paginated (.k-grid-content)
 * and virtual-scroll (.k-virtual-scrollable-wrap) grids in a single query.
 * Used by row/cell extraction functions that run on either grid type.
 */
export const KENDO_CONTENT_AREA: SelectorEntry = {
  selector: ".k-grid-content, .k-virtual-scrollable-wrap",
  stability: "medium",
  risk: "Inherits risk from both KENDO_GRID_CONTENT and KENDO_VIRTUAL_WRAP. If either class is renamed, that grid type's rows will return empty.",
  usedIn: ["scraper.ts:extractKendoRows", "scraper.ts:extractRawRows"],
}

/**
 * Content container for virtual-scroll grids (RecyclableScroller pattern).
 * Presence of this element (vs k-grid-content) is the flag for virtual mode.
 */
export const KENDO_VIRTUAL_WRAP: SelectorEntry = {
  selector: ".k-virtual-scrollable-wrap",
  stability: "medium",
  risk: "Kendo virtual scrolling internal class. If Kendo moves to a different recycler (e.g. CSS scroll-snap), this selector breaks entirely. Monitor on every OneSchool maintenance window.",
  usedIn: [
    "scraper.ts:extractKendoRows",
    "scraper.ts:extractRawRows",
    "scraper.ts:scrollAndAccumulateRows",
    "scraper.ts:extractKendoGrids",
    "contents/scraper.ts:waitForKendoReady",
  ],
}

// ─── Kendo grid — rows / cells ────────────────────────────────────────────────

/**
 * Data row selector — excludes grouping, detail, and no-data sentinel rows.
 * Fragile because k-grouping-row / k-detail-row / k-no-data are all internal
 * Kendo classes that could be renamed.  However, the absence of any exclusion
 * would only cause extra empty rows to appear (detectable by test assertions).
 */
export const KENDO_DATA_ROWS: SelectorEntry = {
  selector: "tbody tr:not(.k-grouping-row):not(.k-detail-row):not(.k-no-data)",
  stability: "fragile",
  risk: "Three internal Kendo class names in the :not() list. If any is renamed, spurious rows will appear in extracted data. Mitigation: assert row count against k-pager-info total in tests.",
  usedIn: ["scraper.ts:extractKendoRows", "scraper.ts:extractRawRows"],
}

/**
 * Cells excluded from column extraction (hierarchy expand buttons, group labels).
 */
export const KENDO_EXCLUDED_CELLS: SelectorEntry = {
  selector: ".k-hierarchy-cell, .k-group-cell",
  stability: "medium",
  risk: "Same risk as KENDO_HIERARCHY_CELL. Both classes are Kendo-internal.",
  usedIn: ["scraper.ts:extractKendoRows", "scraper.ts:extractRawRows"],
}

// ─── Kendo grid — loading state ───────────────────────────────────────────────

/**
 * Loading mask overlay.  Presence means the grid is still fetching data.
 * Used both in the scraper (wait until idle) and actor (wait after actions).
 */
export const KENDO_LOADING_MASK: SelectorEntry = {
  selector: ".k-loading-mask",
  stability: "medium",
  risk: "Kendo-internal. If renamed, the idle-wait will resolve immediately and rows may be scraped before data arrives — causing empty or partial tables.",
  usedIn: [
    "scraper.ts:waitForKendoIdleMs",
    "contents/scraper.ts:waitForKendoReady",
    "contents/actor.ts:waitForKendoIdle",
  ],
}

/**
 * Quick row-existence check used by the content script to detect when the
 * grid has at least one row rendered (combined with idle-mask check).
 */
export const KENDO_READY_ROWS: SelectorEntry = {
  selector: ".k-grid-content tbody tr, .k-virtual-scrollable-wrap tbody tr",
  stability: "medium",
  risk: "Combination of KENDO_GRID_CONTENT and KENDO_VIRTUAL_WRAP risks. If either is renamed, the ready-check resolves on timeout (6 s), delaying scrapes but not breaking them.",
  usedIn: ["contents/scraper.ts:waitForKendoReady"],
}

// ─── Form field extraction ────────────────────────────────────────────────────

/**
 * Explicit label-for association — most reliable PII detection path.
 */
export const FORM_LABEL_FOR: SelectorEntry = {
  selector: "label[for]",
  stability: "stable",
  risk: "Standard HTML. Unchanged since HTML4. Zero drift risk.",
  usedIn: ["scraper.ts:extractFormFields"],
}

/**
 * Definition list — used by some OneSchool detail views to show field:value pairs.
 */
export const FORM_DL_DT: SelectorEntry = {
  selector: ":scope > dt",
  stability: "stable",
  risk: "Standard HTML. Applied within a <dl> context via querySelectorAll.",
  usedIn: ["scraper.ts:extractFormFields"],
}

export const FORM_DL_DD: SelectorEntry = {
  selector: ":scope > dd",
  stability: "stable",
  risk: "Standard HTML.",
  usedIn: ["scraper.ts:extractFormFields"],
}

/**
 * Key-value table rows (th=label, td=value) outside of Kendo grids.
 * Used in some OneSchool profile/detail pages.
 */
export const FORM_TABLE_ROW: SelectorEntry = {
  selector: "table:not(.k-grid table) tr",
  stability: "medium",
  risk: "The :not(.k-grid table) exclusion prevents double-extracting Kendo grid data. If OneSchool nests data tables inside k-grid, this may over-exclude.",
  usedIn: ["scraper.ts:extractFormFields"],
}

// ─── Actor navigation ─────────────────────────────────────────────────────────

/**
 * Text-content match for navigation targets (nav links, menu items, buttons).
 * Broad by design — the LLM provides a human-readable target label and we
 * fuzzy-match it against visible clickable elements.
 */
export const ACTOR_NAV_ELEMENTS: SelectorEntry = {
  selector: "a, button, [role='menuitem'], [role='button'], .k-item",
  stability: "medium",
  risk: "ARIA roles (menuitem, button) are stable. .k-item is Kendo-internal and may be renamed. Mitigate: fall back to text-match on <li> if .k-item yields nothing.",
  usedIn: ["contents/actor.ts:handleNavigate"],
}

// ─── Actor Kendo dropdown ─────────────────────────────────────────────────────

/**
 * Popup list items rendered by Kendo DropDownList / ComboBox.
 * Appears after clicking the dropdown trigger; dismissed by clicking item or
 * pressing Escape.
 */
export const KENDO_DROPDOWN_ITEMS: SelectorEntry = {
  selector: ".k-animation-container .k-list-item, .k-popup .k-item",
  stability: "fragile",
  risk: "Two Kendo-internal class names. k-list-item was introduced in Kendo 2020.x; older Kendo uses .k-item inside .k-popup. Both are included for backwards compat. Drift risk: HIGH — watch on every OneSchool maintenance window.",
  usedIn: ["contents/actor.ts:handleSelect"],
}

// ─── Documented actor selectors (from code comments; not yet wired as constants) ──

/**
 * Add-absence button.  Currently matched via text content in handleNavigate;
 * upgrading to a stable attribute selector improves resilience.
 *
 * STATUS: documented, not yet used as a named constant in actor.ts.
 * TODO: wire into actor.ts handleAbsence when that handler is added.
 */
export const ABSENCE_ADD_BUTTON: SelectorEntry = {
  selector: "button[title*='Add']",
  stability: "medium",
  risk: "Substring title match — works as long as the Add Absence button keeps 'Add' in its title attribute. If QLD DoE internationalises or renames it, this breaks silently.",
  usedIn: [], // not yet wired
}

export const NAME_SEARCH_INPUT: SelectorEntry = {
  selector: "input[placeholder*='name']",
  stability: "fragile",
  risk: "Placeholder text is the most volatile attribute — easily changed by a content update without any code change. Replace with a stable id or aria-label if OneSchool exposes one.",
  usedIn: [], // not yet wired
}

export const PERIOD_CHECKBOXES: SelectorEntry = {
  selector: ".k-grid tbody input[type='checkbox']",
  stability: "medium",
  risk: "Kendo-grid-scoped checkbox selector. Stable as long as Kendo renders checkboxes as native <input type=checkbox>.",
  usedIn: [], // not yet wired
}

export const ABSENCE_REASON_DROPDOWN: SelectorEntry = {
  selector: ".k-dropdownlist[aria-label*='reason']",
  stability: "medium",
  risk: "Aria-label substring match. ARIA labels are more stable than class names but still editable by QLD DoE. Better than text-content matching.",
  usedIn: [], // not yet wired
}

export const SAVE_BUTTON: SelectorEntry = {
  selector: "button[type='submit']",
  stability: "stable",
  risk: "Standard HTML. Zero drift risk for the attribute; may match multiple submit buttons on a page. Qualify with a parent selector once the form structure is confirmed.",
  usedIn: [], // not yet wired
}

// ─── Full registry (used by fixture-diff.mjs) ────────────────────────────────

/**
 * Every selector in one flat list for tooling and audit purposes.
 * The fixture-diff script iterates this to check each selector against
 * versioned HTML snapshots.
 */
export const ALL_SELECTORS: Record<string, SelectorEntry> = {
  KENDO_GRID,
  KENDO_DETAIL_CELL,
  KENDO_HEADER_CELLS,
  KENDO_COLUMN_TITLE,
  KENDO_HIERARCHY_CELL,
  KENDO_PAGER_INFO,
  KENDO_GRID_CONTENT,
  KENDO_CONTENT_AREA,
  KENDO_VIRTUAL_WRAP,
  KENDO_DATA_ROWS,
  KENDO_EXCLUDED_CELLS,
  KENDO_LOADING_MASK,
  KENDO_READY_ROWS,
  FORM_LABEL_FOR,
  FORM_DL_DT,
  FORM_DL_DD,
  FORM_TABLE_ROW,
  ACTOR_NAV_ELEMENTS,
  KENDO_DROPDOWN_ITEMS,
  ABSENCE_ADD_BUTTON,
  NAME_SEARCH_INPUT,
  PERIOD_CHECKBOXES,
  ABSENCE_REASON_DROPDOWN,
  SAVE_BUTTON,
}
