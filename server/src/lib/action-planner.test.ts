import { describe, it, expect } from "vitest"
import { parseActionResponse } from "./action-planner.js"

describe("parseActionResponse", () => {
  it("parses a clean JSON response", () => {
    const raw = `{"type":"navigate","target":"Supervisions","description":"Go to Supervisions","reasoning":"First step","risk":"low"}`
    const action = parseActionResponse(raw)
    expect(action.type).toBe("navigate")
    expect(action.target).toBe("Supervisions")
    expect(action.risk).toBe("low")
  })

  it("extracts JSON from a response with surrounding prose", () => {
    const raw = `Sure, here is the action:\n{"type":"scrape","description":"Read the page","reasoning":"Need context","risk":"low"}\nDone.`
    const action = parseActionResponse(raw)
    expect(action.type).toBe("scrape")
  })

  it("handles nested JSON inside the response", () => {
    const raw = `{"type":"fill","selector":"input[name='staff']","value":"[NAME_001]","description":"Fill staff name","reasoning":"Entry required","risk":"medium"}`
    const action = parseActionResponse(raw)
    expect(action.type).toBe("fill")
    expect(action.value).toBe("[NAME_001]")
    expect(action.risk).toBe("medium")
  })

  it("defaults risk to medium when missing", () => {
    const raw = `{"type":"click","selector":"button","description":"Click save","reasoning":"Submit"}`
    const action = parseActionResponse(raw)
    expect(action.risk).toBe("medium")
  })

  it("defaults reasoning to empty string when missing", () => {
    const raw = `{"type":"done","description":"Task complete"}`
    const action = parseActionResponse(raw)
    expect(action.reasoning).toBe("")
  })

  it("throws when no JSON object is present", () => {
    expect(() => parseActionResponse("Sorry, I cannot help with that.")).toThrow()
  })

  it("throws when type field is missing", () => {
    expect(() => parseActionResponse(`{"description":"No type here","risk":"low"}`)).toThrow(/type/)
  })

  it("throws when description field is missing", () => {
    expect(() => parseActionResponse(`{"type":"click","risk":"low"}`)).toThrow(/description/)
  })
})
