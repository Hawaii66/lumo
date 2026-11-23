import { describe, expect, it } from "vitest"
import { diffPartsForSide } from "./text-diff"

describe("diffPartsForSide", () => {
  it("highlights removals on the old side", () => {
    const parts = diffPartsForSide("a b c", "a x c", "old")
    expect(
      parts.map((p) => ({
        value: p.value,
        removed: p.removed === true,
      })),
    ).toEqual([
      { value: "a ", removed: false },
      { value: "b", removed: true },
      { value: " c", removed: false },
    ])
  })

  it("highlights additions on the new side", () => {
    const parts = diffPartsForSide("a b c", "a x c", "new")
    expect(
      parts.map((p) => ({
        value: p.value,
        added: p.added === true,
      })),
    ).toEqual([
      { value: "a ", added: false },
      { value: "x", added: true },
      { value: " c", added: false },
    ])
  })
})
