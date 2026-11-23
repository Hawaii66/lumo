/** Fixed reason types for per-user problem markers. */
export const PROBLEM_REASON_IDS = [
  "hard",
  "insight",
  "teacher",
  "other",
] as const

export type ProblemReasonId = (typeof PROBLEM_REASON_IDS)[number]

export const PROBLEM_REASON_NOTE_MAX = 500

export function isProblemReasonId(value: string): value is ProblemReasonId {
  return (PROBLEM_REASON_IDS as ReadonlyArray<string>).includes(value)
}
