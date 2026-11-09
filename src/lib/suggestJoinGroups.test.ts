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
    expect(suggestion.nameBase).toBe("sammanslagen-280101")
    expect(suggestion.fileNames).toEqual(["T280101.pdf", "L280101.pdf"])
    expect(suggestion.fileIds).toEqual(["t", "l"])
  })
})
