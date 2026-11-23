import { diffWordsWithSpace, type Change } from "diff"

export type DiffSide = "old" | "new"

/** Word-level parts for one side of a git-style split diff. */
export function diffPartsForSide(
  oldText: string,
  newText: string,
  side: DiffSide,
): Array<Change> {
  const parts = diffWordsWithSpace(oldText, newText)
  if (side === "old") {
    return parts.filter((part) => part.added !== true)
  }
  return parts.filter((part) => part.removed !== true)
}
