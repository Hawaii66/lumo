export const PROBLEM_REPORT_REASONS = [
  "wrong_problem",
  "wrong_answer",
  "missing_answer",
  "missing_figure",
  "missing_image",
  "wrong_formatting",
  "other",
] as const

export type ProblemReportReason = (typeof PROBLEM_REPORT_REASONS)[number]

export const PROBLEM_REPORT_REASON_OPTIONS: Array<{
  value: ProblemReportReason
  label: string
}> = [
  { value: "wrong_problem", label: "Fel i uppgiften" },
  { value: "wrong_answer", label: "Fel i facit" },
  { value: "missing_answer", label: "Saknat svar" },
  { value: "missing_figure", label: "Saknad figur/bild" },
  { value: "missing_image", label: "Saknad bild" },
  { value: "wrong_formatting", label: "Fel formatering" },
  { value: "other", label: "Annat" },
]

export const PROBLEM_REPORT_STATUSES = [
  "open",
  "resolved",
  "dismissed",
] as const

export type ProblemReportStatus = (typeof PROBLEM_REPORT_STATUSES)[number]

export const PROBLEM_REPORT_STATUS_LABELS: Record<ProblemReportStatus, string> =
  {
    open: "Öppen",
    resolved: "Löst",
    dismissed: "Avvisad",
  }

export const MAX_REPORT_DETAILS_LENGTH = 2000
