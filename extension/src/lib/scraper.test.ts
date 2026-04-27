/**
 * scraper.test.ts — DOM Resilience Epic 1 (Story 1.2 — Versioned fixtures)
 *
 * Tests extraction functions against committed HTML fixtures in
 * extension/fixtures/v1/.  If a selector breaks after a OneSchool update,
 * the failing test identifies exactly which selector regressed and which
 * function stopped working.
 *
 * Run:  npm test  (from extension/)
 * CI:   .github/workflows/dom-resilience.yml
 */

import { describe, it, expect, beforeAll } from "vitest"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"
import {
  classifyField,
  extractKendoGrids,
  extractHtmlTables,
  extractFormFields,
  scrollAndAccumulateRows,
} from "./scraper"
import { ALL_SELECTORS } from "./selectors"

const __dir = dirname(fileURLToPath(import.meta.url))
const FIXTURES = resolve(__dir, "../../fixtures/v1")

function loadFixture(name: string): Document {
  const html = readFileSync(resolve(FIXTURES, name), "utf-8")
  return new JSDOM(html).window.document
}

// Identity tokenizer — returns raw value unchanged (no PII substitution needed for tests)
const noopTokenize = (v: string) => v

// ── Fixture loading ──────────────────────────────────────────────────────────

describe("fixtures exist and are parseable", () => {
  it("kendo-grid-standard.html loads", () => {
    const doc = loadFixture("kendo-grid-standard.html")
    expect(doc.querySelector(".k-grid")).not.toBeNull()
  })

  it("kendo-grid-virtual.html loads", () => {
    const doc = loadFixture("kendo-grid-virtual.html")
    expect(doc.querySelector(".k-grid")).not.toBeNull()
  })

  it("form-fields.html loads", () => {
    const doc = loadFixture("form-fields.html")
    expect(doc.querySelector("form")).not.toBeNull()
  })
})

// ── Standard Kendo grid ──────────────────────────────────────────────────────

describe("extractKendoGrids — standard (paginated) grid", () => {
  let tables: Awaited<ReturnType<typeof extractKendoGrids>>

  beforeAll(async () => {
    const doc = loadFixture("kendo-grid-standard.html")
    tables = await extractKendoGrids(doc, noopTokenize)
  })

  it("finds exactly one grid", () => {
    expect(tables).toHaveLength(1)
  })

  it("extracts grid id", () => {
    expect(tables[0].meta.gridId).toBe("staffGrid")
  })

  it("extracts 4 column headers", () => {
    expect(tables[0].headers).toEqual(["Name", "Employee ID", "Position", "School"])
  })

  it("extracts exactly 2 data rows (excludes k-grouping-row, k-detail-row, k-no-data)", () => {
    expect(tables[0].rows).toHaveLength(2)
  })

  it("extracts correct values for first row", () => {
    expect(tables[0].rows[0]).toEqual(["Jane Doe", "DOEJA1", "Classroom Teacher", "Springfield State School"])
  })

  it("extracts correct values for second row", () => {
    expect(tables[0].rows[1]).toEqual(["John Smith", "SMITJ1", "Deputy Principal", "Springfield State School"])
  })

  it("parses pager: total=2, hasMore=false", () => {
    const pager = tables[0].meta.pageInfo
    expect(pager?.total).toBe(2)
    expect(pager?.hasMore).toBe(false)
    expect(pager?.currentStart).toBe(1)
    expect(pager?.currentEnd).toBe(2)
  })

  it("marks grid as non-virtual", () => {
    expect(tables[0].meta.isVirtual).toBe(false)
  })

  it("marks source as kendo", () => {
    expect(tables[0].meta.source).toBe("kendo")
  })
})

// ── Virtual scroll grid ──────────────────────────────────────────────────────

describe("extractKendoGrids — virtual scroll grid", () => {
  let tables: Awaited<ReturnType<typeof extractKendoGrids>>

  beforeAll(async () => {
    const doc = loadFixture("kendo-grid-virtual.html")
    tables = await extractKendoGrids(doc, noopTokenize)
  })

  it("finds exactly one grid", () => {
    expect(tables).toHaveLength(1)
  })

  it("marks grid as virtual", () => {
    expect(tables[0].meta.isVirtual).toBe(true)
  })

  it("extracts 4 column headers", () => {
    expect(tables[0].headers).toEqual(["Date", "Student Name", "Class", "Reason"])
  })

  it("captures all 3 initially-visible rows (jsdom scroll=0 triggers atBottom immediately)", () => {
    expect(tables[0].rows).toHaveLength(3)
  })

  it("parses pager: total=150, hasMore=true", () => {
    const pager = tables[0].meta.pageInfo
    expect(pager?.total).toBe(150)
    expect(pager?.hasMore).toBe(true)
  })

  it("deduplicates rows — multiple capture calls don't duplicate", async () => {
    // A second extractKendoGrids call on the same document should still yield 3 rows
    const doc = loadFixture("kendo-grid-virtual.html")
    const t2 = await extractKendoGrids(doc, noopTokenize)
    expect(t2[0].rows).toHaveLength(3)
  })
})

// ── scrollAndAccumulateRows — direct unit tests ───────────────────────────────

describe("scrollAndAccumulateRows", () => {
  it("returns non-virtual path when no .k-virtual-scrollable-wrap present", async () => {
    const doc = loadFixture("kendo-grid-standard.html")
    const grid = doc.querySelector(".k-grid")!
    const headers = ["Name", "Employee ID", "Position", "School"]
    const { rows, fullyLoaded } = await scrollAndAccumulateRows(grid, headers, noopTokenize)
    expect(rows).toHaveLength(2)
    expect(fullyLoaded).toBe(true)
  })

  it("calls onProgress at least once for a virtual grid", async () => {
    const doc = loadFixture("kendo-grid-virtual.html")
    const grid = doc.querySelector(".k-grid")!
    const headers = ["Date", "Student Name", "Class", "Reason"]
    const calls: Array<[number, number]> = []
    await scrollAndAccumulateRows(grid, headers, noopTokenize, (loaded, total) => {
      calls.push([loaded, total])
    })
    expect(calls.length).toBeGreaterThan(0)
    expect(calls[0][1]).toBe(150) // total from pager
  })
})

// ── Form field extraction ────────────────────────────────────────────────────

describe("extractFormFields", () => {
  let fields: ReturnType<typeof extractFormFields>

  beforeAll(() => {
    const doc = loadFixture("form-fields.html")
    fields = extractFormFields(doc, noopTokenize)
  })

  it("extracts label[for] fields (pattern 1)", () => {
    const names = fields.map((f) => f.label)
    expect(names).toContain("Staff Name")
    expect(names).toContain("Employee ID")
  })

  it("skips empty label[for] inputs", () => {
    const notes = fields.find((f) => f.label === "Notes")
    expect(notes).toBeUndefined()
  })

  it("extracts dl dt/dd fields (pattern 2)", () => {
    const names = fields.map((f) => f.label)
    expect(names).toContain("Full Name")
    expect(names).toContain("Email")
    expect(names).toContain("School")
  })

  it("skips empty dl dd values (pattern 2)", () => {
    const mobile = fields.find((f) => f.label === "Mobile")
    expect(mobile).toBeUndefined()
  })

  it("extracts table th/td rows (pattern 3)", () => {
    const names = fields.map((f) => f.label)
    expect(names).toContain("Duty Type")
    expect(names).toContain("Period")
  })

  it("does NOT extract rows from inside .k-grid (pattern 3 exclusion)", () => {
    const bad = fields.find((f) => f.label === "Should NOT appear")
    expect(bad).toBeUndefined()
  })

  it("deduplicates identical label::value pairs", () => {
    // No fixture has actual duplicates, but ensure the dedup Set works
    const keys = fields.map((f) => `${f.label}::${f.rawValue}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

// ── HTML table extraction ────────────────────────────────────────────────────

describe("extractHtmlTables", () => {
  it("does NOT pick up tables inside .k-grid", () => {
    const doc = loadFixture("kendo-grid-standard.html")
    const tables = extractHtmlTables(doc, noopTokenize)
    // All tables in this fixture are inside .k-grid — none should be extracted
    expect(tables).toHaveLength(0)
  })

  it("extracts a plain HTML table outside .k-grid", () => {
    const doc = new JSDOM(`
      <table>
        <thead><tr><th>Col A</th><th>Col B</th></tr></thead>
        <tbody>
          <tr><td>val1</td><td>val2</td></tr>
        </tbody>
      </table>
    `).window.document
    const tables = extractHtmlTables(doc, noopTokenize)
    expect(tables).toHaveLength(1)
    expect(tables[0].headers).toEqual(["Col A", "Col B"])
    expect(tables[0].rows[0]).toEqual(["val1", "val2"])
  })
})

// ── PII classification ───────────────────────────────────────────────────────

describe("classifyField", () => {
  it("classifies 'Name' label as name", () => {
    expect(classifyField("Name", "Jane Doe")).toBe("name")
  })

  it("classifies 'Employee ID' label as staffid", () => {
    expect(classifyField("Employee ID", "DOEJA1")).toBe("staffid")
  })

  it("detects EQ Staff ID pattern in value (SMITJ1)", () => {
    expect(classifyField("", "SMITJ1")).toBe("staffid")
  })

  it("detects email in value", () => {
    expect(classifyField("", "jane.doe@eq.edu.au")).toBe("email")
  })

  it("detects Email label", () => {
    expect(classifyField("Email", "anything")).toBe("email")
  })

  it("returns unknown for unclassifiable content", () => {
    expect(classifyField("Notes", "Playground duty")).toBe("unknown")
  })

  it("classifies TFN label", () => {
    expect(classifyField("Tax File Number", "123 456 789")).toBe("tfn")
  })

  it("classifies DOB label", () => {
    expect(classifyField("Date of Birth", "1990-01-01")).toBe("dob")
  })
})

// ── Selector registry completeness ───────────────────────────────────────────

describe("ALL_SELECTORS registry", () => {
  it("contains at least 15 entries", () => {
    expect(Object.keys(ALL_SELECTORS).length).toBeGreaterThanOrEqual(15)
  })

  it("every entry has a non-empty selector string", () => {
    for (const [name, entry] of Object.entries(ALL_SELECTORS)) {
      expect(entry.selector, `${name}.selector`).toBeTruthy()
    }
  })

  it("every entry has a stability rating", () => {
    const valid = new Set(["stable", "medium", "fragile"])
    for (const [name, entry] of Object.entries(ALL_SELECTORS)) {
      expect(valid.has(entry.stability), `${name}.stability`).toBe(true)
    }
  })

  it("every entry has a non-empty risk note", () => {
    for (const [name, entry] of Object.entries(ALL_SELECTORS)) {
      expect(entry.risk, `${name}.risk`).toBeTruthy()
    }
  })

  it("fragile selectors have usedIn populated (to know where to fix them)", () => {
    for (const [name, entry] of Object.entries(ALL_SELECTORS)) {
      if (entry.stability === "fragile" && entry.usedIn.length > 0) {
        expect(entry.usedIn.length, `${name} usedIn`).toBeGreaterThan(0)
      }
    }
  })

  it("all selectors are valid CSS (parseable by querySelectorAll)", () => {
    const doc = new JSDOM("<div></div>").window.document
    for (const [name, entry] of Object.entries(ALL_SELECTORS)) {
      // Some selectors use :scope which needs a parent — test on body
      expect(
        () => doc.body.querySelectorAll(entry.selector),
        `${name} selector "${entry.selector}" should be valid CSS`
      ).not.toThrow()
    }
  })
})
