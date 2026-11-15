export const PROBLEM_TEXT_SIZES = ["small", "medium", "large"] as const

export type ProblemTextSize = (typeof PROBLEM_TEXT_SIZES)[number]

export const PROBLEM_TEXT_SIZE_LABELS: Record<ProblemTextSize, string> = {
  small: "Liten",
  medium: "Medium",
  large: "Stor",
}

/** Default size in problem view and chat. */
export const DEFAULT_PROBLEM_TEXT_SIZE: ProblemTextSize = "medium"

export function isProblemTextSize(value: unknown): value is ProblemTextSize {
  return (
    typeof value === "string" &&
    (PROBLEM_TEXT_SIZES as readonly string[]).includes(value)
  )
}

export function resolveProblemTextSize(
  saved: ProblemTextSize | null | undefined,
): ProblemTextSize {
  if (saved != null && isProblemTextSize(saved)) return saved
  return DEFAULT_PROBLEM_TEXT_SIZE
}
