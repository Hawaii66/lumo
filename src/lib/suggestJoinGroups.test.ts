import { describe, expect, it } from "vitest"
import { detectJoinGroups } from "./suggestJoinGroups"

describe("detectJoinGroups", () => {
  it("matches L280101 with T280101 and orders T before L", () => {
    const suggestions = detectJoinGroups([
      { id: "l", name: "L280101.pdf" },
      { id: "t", name: "T280101.pdf" },
    ])

    expect(suggestions).toHaveLength(1)
    const suggestion = suggestions[0]!
    expect(suggestion.key).toBe("date:2028-01-01")
    expect(suggestion.label).toBe("Datum 2028-01-01")
    expect(suggestion.reason).toBe("samma datum (2028-01-01)")
    expect(suggestion.nameBase).toBe("sammanslagen-280101")
    expect(suggestion.fileNames).toEqual(["T280101.pdf", "L280101.pdf"])
    expect(suggestion.fileIds).toEqual(["t", "l"])
  })

  it("groups compact YYMMDD, YYYYMMDD, and separated date formats for the same day", () => {
    const suggestions = detectJoinGroups([
      { id: "a", name: "T280101.pdf" },
      { id: "b", name: "L20280101.pdf" },
      { id: "c", name: "notes_28-01-01.pdf" },
      { id: "d", name: "facit 2028-01-01.pdf" },
    ])

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.key).toBe("date:2028-01-01")
    expect(suggestions[0]!.fileIds).toEqual(["a", "c", "d", "b"])
    expect(suggestions[0]!.fileNames).toEqual([
      "T280101.pdf",
      "notes_28-01-01.pdf",
      "facit 2028-01-01.pdf",
      "L20280101.pdf",
    ])
  })

  it("orders exam tokens before neutral names before solution tokens", () => {
    const suggestions = detectJoinGroups([
      { id: "sol", name: "lösning_230111.pdf" },
      { id: "misc", name: "anteckningar_230111.pdf" },
      { id: "exam", name: "tenta_230111.pdf" },
    ])

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.fileIds).toEqual(["exam", "misc", "sol"])
  })

  it("uses the last prefix segment for role ranking", () => {
    const suggestions = detectJoinGroups([
      { id: "late", name: "kurs_facit_230111.pdf" },
      { id: "early", name: "kurs_tenta_230111.pdf" },
    ])

    expect(suggestions[0]!.fileIds).toEqual(["early", "late"])
  })

  it("produces separate suggestions for different dates, sorted by label", () => {
    const suggestions = detectJoinGroups([
      { id: "l2", name: "L280202.pdf" },
      { id: "t2", name: "T280202.pdf" },
      { id: "l1", name: "L280101.pdf" },
      { id: "t1", name: "T280101.pdf" },
    ])

    expect(suggestions.map((s) => s.key)).toEqual([
      "date:2028-01-01",
      "date:2028-02-02",
    ])
    expect(suggestions[0]!.fileNames).toEqual(["T280101.pdf", "L280101.pdf"])
    expect(suggestions[1]!.fileNames).toEqual(["T280202.pdf", "L280202.pdf"])
  })

  it("ignores files without a trailing date and single-file date buckets", () => {
    const suggestions = detectJoinGroups([
      { id: "solo", name: "T280101.pdf" },
      { id: "readme", name: "README.pdf" },
      { id: "mid", name: "T280101-v2.pdf" },
    ])

    expect(suggestions).toEqual([])
  })

  it("rejects invalid month or day values", () => {
    const suggestions = detectJoinGroups([
      { id: "a", name: "T281301.pdf" },
      { id: "b", name: "L281301.pdf" },
      { id: "c", name: "T280132.pdf" },
      { id: "d", name: "L280132.pdf" },
    ])

    expect(suggestions).toEqual([])
  })

  it("respects minInputs and maxInputs options", () => {
    const files = [
      { id: "1", name: "T280101.pdf" },
      { id: "2", name: "L280101.pdf" },
      { id: "3", name: "notes_280101.pdf" },
    ]

    expect(detectJoinGroups(files, { minInputs: 4 })).toEqual([])

    const capped = detectJoinGroups(files, { maxInputs: 2 })
    expect(capped).toHaveLength(1)
    expect(capped[0]!.fileIds).toEqual(["1", "3"])
    expect(capped[0]!.fileNames).toEqual(["T280101.pdf", "notes_280101.pdf"])
  })
})
