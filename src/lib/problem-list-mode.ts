export const PROBLEM_LIST_MODES = ["tillfallen", "tree"] as const

export type ProblemListMode = (typeof PROBLEM_LIST_MODES)[number]

export const PROBLEM_LIST_MODE_LABELS: Record<ProblemListMode, string> = {
  tillfallen: "Tillfällen",
  tree: "Träd",
}

/** Default on load; switches stay in client state only. */
export const DEFAULT_PROBLEM_LIST_MODE: ProblemListMode = "tillfallen"

export function isProblemListMode(value: unknown): value is ProblemListMode {
  return (
    typeof value === "string" &&
    (PROBLEM_LIST_MODES as readonly string[]).includes(value)
  )
}

/**
 * Use the client preference when valid; fall back to tree when tillfällen
 * are requested but unavailable.
 */
export function resolveProblemListMode(
  preferred: ProblemListMode,
  showTillfallen: boolean,
): ProblemListMode {
  if (preferred === "tillfallen" && !showTillfallen) {
    return "tree"
  }
  return preferred
}

/** Major chapter for dotted booklet numbers like "1.2" → "1". */
export function dottedProblemMajor(problemNumber: string): string | null {
  const match = problemNumber.trim().match(/^(\d+)\.\d+/)
  return match?.[1] ?? null
}
