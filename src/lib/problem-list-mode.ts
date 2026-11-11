export const PROBLEM_LIST_MODES = ["tillfallen", "tree", "list"] as const

export type ProblemListMode = (typeof PROBLEM_LIST_MODES)[number]

export const PROBLEM_LIST_MODE_LABELS: Record<ProblemListMode, string> = {
  tillfallen: "Tillfällen",
  tree: "Träd",
  list: "Lista",
}

/** Fallback when no tillfällen exist and the user has no saved preference. */
export const DEFAULT_PROBLEM_LIST_MODE: ProblemListMode = "tree"

export function isProblemListMode(value: unknown): value is ProblemListMode {
  return (
    typeof value === "string" &&
    (PROBLEM_LIST_MODES as readonly string[]).includes(value)
  )
}

/**
 * Prefer a saved preference; otherwise tillfällen when the room has any,
 * else tree.
 */
export function resolveProblemListMode(
  saved: ProblemListMode | null | undefined,
  hasOccasions: boolean,
): ProblemListMode {
  if (saved != null) return saved
  return hasOccasions ? "tillfallen" : DEFAULT_PROBLEM_LIST_MODE
}

/** Major chapter for dotted booklet numbers like "1.2" → "1". */
export function dottedProblemMajor(problemNumber: string): string | null {
  const match = problemNumber.trim().match(/^(\d+)\.\d+/)
  return match?.[1] ?? null
}
