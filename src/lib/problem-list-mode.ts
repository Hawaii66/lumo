export const PROBLEM_LIST_MODES = ["list", "tree", "tillfallen"] as const

export type ProblemListMode = (typeof PROBLEM_LIST_MODES)[number]

export const PROBLEM_LIST_MODE_LABELS: Record<ProblemListMode, string> = {
  list: "Lista",
  tree: "Träd",
  tillfallen: "Tillfällen",
}

export const DEFAULT_PROBLEM_LIST_MODE: ProblemListMode = "list"

export function isProblemListMode(value: unknown): value is ProblemListMode {
  return (
    typeof value === "string" &&
    (PROBLEM_LIST_MODES as readonly string[]).includes(value)
  )
}

/** Major chapter for dotted booklet numbers like "1.2" → "1". */
export function dottedProblemMajor(problemNumber: string): string | null {
  const match = problemNumber.trim().match(/^(\d+)\.\d+/)
  return match?.[1] ?? null
}
