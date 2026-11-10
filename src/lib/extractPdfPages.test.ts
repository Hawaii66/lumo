import { describe, expect, it } from "vitest"
import {
  countPagesInRanges,
  validatePageRangesAgainstCount,
} from "./extractPdfPages"

describe("countPagesInRanges", () => {
  it("sums inclusive ranges", () => {
    expect(countPagesInRanges([])).toBe(0)
    expect(
      countPagesInRanges([
        { start: 1, end: 3 },
        { start: 10, end: 10 },
      ]),
    ).toBe(4)
  })
})

describe("validatePageRangesAgainstCount", () => {
  it("accepts valid non-overlapping ranges within page count", () => {
    expect(() =>
      validatePageRangesAgainstCount(
        [
          { start: 1, end: 2 },
          { start: 4, end: 5 },
        ],
        5,
      ),
    ).not.toThrow()
  })

  it("rejects empty PDF page count", () => {
    expect(() =>
      validatePageRangesAgainstCount([{ start: 1, end: 1 }], 0),
    ).toThrow("PDF:en har inga sidor")
  })

  it("rejects ranges that extend past page count", () => {
    expect(() =>
      validatePageRangesAgainstCount([{ start: 1, end: 4 }], 3),
    ).toThrow("Sidan 4 finns inte (PDF:en har 3 sidor)")
  })

  it("rejects empty or overlapping ranges via assertValidPageRanges", () => {
    expect(() => validatePageRangesAgainstCount([], 10)).toThrow(
      "Välj minst ett sidintervall",
    )
    expect(() =>
      validatePageRangesAgainstCount(
        [
          { start: 1, end: 3 },
          { start: 3, end: 5 },
        ],
        10,
      ),
    ).toThrow("överlappar")
  })
})
