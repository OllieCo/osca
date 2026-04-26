import { describe, it, expect, beforeEach } from "vitest"
import { JSDOM } from "jsdom"
import { extractFormFields, extractKendoGrids, extractHtmlTables, classifyField, scrollAndAccumulateRows } from "./scraper"
import { clearTokenMap } from "./tokenizer"
import type { FieldType } from "../types/index"

// Pass-through tokenizer for scraper tests — we test extraction, not tokenization
const passThrough = (v: string, _t: FieldType) => v

beforeEach(() => clearTokenMap())

function dom(html: string) {
  return new JSDOM(html).window.document
}

describe("classifyField", () => {
  it("classifies by label — name", () => expect(classifyField("Full Name", "Alice")).toBe("name"))
  it("classifies by label — email", () => expect(classifyField("Email Address", "x")).toBe("email"))
  it("classifies by label — phone", () => expect(classifyField("Mobile Number", "x")).toBe("phone"))
  it("classifies by label — QSN", () => expect(classifyField("QSN", "123")).toBe("qsn"))
  it("falls back to value matching for email", () => expect(classifyField("", "foo@bar.com")).toBe("email"))
  it("returns unknown when no signal", () => expect(classifyField("", "hello")).toBe("unknown"))

  // EQ ID — CONFIRMED: 10 digits + 1 letter (OneSchool TRAIN)
  it("classifies by label — EQ ID", () => expect(classifyField("EQ ID", "x")).toBe("qsn"))
  it("classifies EQ ID by value — 10 digits + letter", () => expect(classifyField("", "1234567890A")).toBe("qsn"))
  it("does NOT classify 9-digit number as EQ ID", () => expect(classifyField("", "123456789A")).not.toBe("qsn"))
  it("does NOT classify 10-digit number without letter as EQ ID", () => expect(classifyField("", "1234567890")).not.toBe("qsn"))

  // EQ Staff Employee ID — CONFIRMED: 5 letters + 1 digit (OneSchool TRAIN)
  it("classifies by label — Staff ID", () => expect(classifyField("Staff ID", "x")).toBe("staffid"))
  it("classifies Staff ID by value — 5 letters + digit", () => expect(classifyField("", "SMITJ1")).toBe("staffid"))
  it("does NOT classify 4 letters + digit as Staff ID", () => expect(classifyField("", "SMIT1")).not.toBe("staffid"))
  it("EQ ID value takes priority over staff ID pattern check", () => {
    // A value matching EQ_ID_RE should return qsn, not staffid
    expect(classifyField("", "1234567890A")).toBe("qsn")
  })
})

describe("extractFormFields", () => {
  it("extracts label[for] + input pairs", () => {
    const doc = dom(`
      <form>
        <label for="name">Full Name</label>
        <input id="name" value="Jane Doe" />
      </form>
    `)
    const fields = extractFormFields(doc, passThrough)
    expect(fields).toHaveLength(1)
    expect(fields[0].label).toBe("Full Name")
    expect(fields[0].rawValue).toBe("Jane Doe")
    expect(fields[0].fieldType).toBe("name")
  })

  it("extracts dl/dt/dd pairs", () => {
    const doc = dom(`
      <dl>
        <dt>Staff ID</dt><dd>EQ123456</dd>
        <dt>Email</dt><dd>staff@eq.edu.au</dd>
      </dl>
    `)
    const fields = extractFormFields(doc, passThrough)
    expect(fields).toHaveLength(2)
    expect(fields[0].label).toBe("Staff ID")
    expect(fields[1].fieldType).toBe("email")
  })

  it("deduplicates identical label+value pairs", () => {
    const doc = dom(`
      <dl>
        <dt>Name</dt><dd>Alice</dd>
        <dt>Name</dt><dd>Alice</dd>
      </dl>
    `)
    const fields = extractFormFields(doc, passThrough)
    expect(fields).toHaveLength(1)
  })

  it("skips empty values", () => {
    const doc = dom(`<label for="x">Label</label><input id="x" value="" />`)
    const fields = extractFormFields(doc, passThrough)
    expect(fields).toHaveLength(0)
  })
})

describe("extractHtmlTables", () => {
  it("extracts headers and rows from a standard table", () => {
    const doc = dom(`
      <table>
        <thead><tr><th>Name</th><th>Email</th></tr></thead>
        <tbody>
          <tr><td>Alice</td><td>alice@eq.edu.au</td></tr>
          <tr><td>Bob</td><td>bob@eq.edu.au</td></tr>
        </tbody>
      </table>
    `)
    const tables = extractHtmlTables(doc, passThrough)
    expect(tables).toHaveLength(1)
    expect(tables[0].headers).toEqual(["Name", "Email"])
    expect(tables[0].rows).toHaveLength(2)
    expect(tables[0].rows[0]).toEqual(["Alice", "alice@eq.edu.au"])
  })

  it("skips tables inside .k-grid", () => {
    const doc = dom(`
      <div class="k-grid">
        <table><tbody><tr><td>should be skipped</td></tr></tbody></table>
      </div>
    `)
    const tables = extractHtmlTables(doc, passThrough)
    expect(tables).toHaveLength(0)
  })
})

describe("extractKendoGrids", () => {
  it("extracts headers from Kendo grid", async () => {
    const doc = dom(`
      <div class="k-grid">
        <div class="k-grid-header">
          <div class="k-grid-header-wrap">
            <table><thead><tr>
              <th class="k-header"><span class="k-column-title">Staff Name</span></th>
              <th class="k-header"><span class="k-column-title">Period</span></th>
            </tr></thead></table>
          </div>
        </div>
        <div class="k-grid-content">
          <table><tbody>
            <tr><td>Alice Smith</td><td>P1</td></tr>
          </tbody></table>
        </div>
      </div>
    `)
    const tables = await extractKendoGrids(doc, passThrough)
    expect(tables).toHaveLength(1)
    expect(tables[0].headers).toEqual(["Staff Name", "Period"])
    expect(tables[0].rows[0]).toEqual(["Alice Smith", "P1"])
    expect(tables[0].meta.source).toBe("kendo")
  })

  it("skips nested grids inside k-detail-cell", async () => {
    const doc = dom(`
      <div class="k-grid">
        <div class="k-grid-header">
          <div class="k-grid-header-wrap">
            <table><thead><tr><th class="k-header"><span class="k-column-title">Period</span></th></tr></thead></table>
          </div>
        </div>
        <div class="k-grid-content"><table><tbody><tr><td>P1</td></tr></tbody></table></div>
        <div class="k-detail-cell">
          <div class="k-grid">
            <div class="k-grid-content"><table><tbody><tr><td>nested</td></tr></tbody></table></div>
          </div>
        </div>
      </div>
    `)
    const tables = await extractKendoGrids(doc, passThrough)
    // Only outer grid — inner grid skipped
    expect(tables).toHaveLength(1)
  })

  it("detects virtual grid via .k-virtual-scrollable-wrap", async () => {
    const doc = dom(`
      <div class="k-grid">
        <div class="k-grid-header">
          <div class="k-grid-header-wrap">
            <table><thead><tr>
              <th class="k-header"><span class="k-column-title">Name</span></th>
            </tr></thead></table>
          </div>
        </div>
        <div class="k-virtual-scrollable-wrap">
          <table><tbody>
            <tr><td>Row A</td></tr>
            <tr><td>Row B</td></tr>
          </tbody></table>
        </div>
      </div>
    `)
    const tables = await extractKendoGrids(doc, passThrough)
    expect(tables).toHaveLength(1)
    expect(tables[0].meta.isVirtual).toBe(true)
    expect(tables[0].rows).toHaveLength(2)
  })

  it("sets hasMore false after full virtual accumulation with no pager", async () => {
    const doc = dom(`
      <div class="k-grid">
        <div class="k-grid-header">
          <div class="k-grid-header-wrap">
            <table><thead><tr>
              <th class="k-header"><span class="k-column-title">Name</span></th>
            </tr></thead></table>
          </div>
        </div>
        <div class="k-virtual-scrollable-wrap">
          <table><tbody>
            <tr><td>Alice</td></tr>
          </tbody></table>
        </div>
      </div>
    `)
    const tables = await extractKendoGrids(doc, passThrough)
    // No pager text → total=0 → fullyLoaded=true → hasMore=false (pageInfo undefined, no pager)
    expect(tables[0].meta.pageInfo).toBeUndefined()
  })
})

describe("scrollAndAccumulateRows", () => {
  it("falls through to sync path for non-virtual grid", async () => {
    const doc = dom(`
      <div class="k-grid">
        <div class="k-grid-content">
          <table><tbody>
            <tr><td>Alpha</td><td>1</td></tr>
            <tr><td>Beta</td><td>2</td></tr>
          </tbody></table>
        </div>
      </div>
    `)
    const grid = doc.querySelector(".k-grid")!
    const result = await scrollAndAccumulateRows(grid, ["Name", "Value"], passThrough)
    expect(result.fullyLoaded).toBe(true)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toEqual(["Alpha", "1"])
  })

  it("accumulates rows from virtual grid and deduplicates", async () => {
    const doc = dom(`
      <div class="k-grid">
        <div class="k-virtual-scrollable-wrap">
          <table><tbody>
            <tr><td>Alice</td></tr>
            <tr><td>Bob</td></tr>
            <tr><td>Alice</td></tr>
          </tbody></table>
        </div>
      </div>
    `)
    const grid = doc.querySelector(".k-grid")!
    const progress: number[] = []
    const result = await scrollAndAccumulateRows(grid, ["Name"], passThrough, (loaded) => progress.push(loaded))
    // Alice deduped — only 2 unique rows
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r[0])).toEqual(["Alice", "Bob"])
    expect(progress.length).toBeGreaterThan(0)
  })

  it("reports fullyLoaded true when accumulated >= pager total", async () => {
    const doc = dom(`
      <div class="k-grid">
        <div class="k-pager-wrap">
          <span class="k-pager-info">1 - 2 of 2 items</span>
        </div>
        <div class="k-virtual-scrollable-wrap">
          <table><tbody>
            <tr><td>Alice</td></tr>
            <tr><td>Bob</td></tr>
          </tbody></table>
        </div>
      </div>
    `)
    const grid = doc.querySelector(".k-grid")!
    const result = await scrollAndAccumulateRows(grid, ["Name"], passThrough)
    expect(result.fullyLoaded).toBe(true)
    expect(result.rows).toHaveLength(2)
  })
})
