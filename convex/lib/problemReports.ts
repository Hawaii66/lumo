import { v } from "convex/values";

export const PROBLEM_REPORT_REASONS = [
  "wrong_problem",
  "wrong_answer",
  "missing_figure",
  "wrong_formatting",
  "other",
] as const;

export type ProblemReportReason = (typeof PROBLEM_REPORT_REASONS)[number];

export const PROBLEM_REPORT_REASON_LABELS: Record<ProblemReportReason, string> =
  {
    wrong_problem: "Fel i uppgiften",
    wrong_answer: "Fel i facit",
    missing_figure: "Saknad figur/bild",
    wrong_formatting: "Fel formatering",
    other: "Annat",
  };

export const PROBLEM_REPORT_STATUSES = [
  "open",
  "resolved",
  "dismissed",
] as const;

export type ProblemReportStatus = (typeof PROBLEM_REPORT_STATUSES)[number];

export const PROBLEM_REPORT_STATUS_LABELS: Record<ProblemReportStatus, string> =
  {
    open: "Öppen",
    resolved: "Löst",
    dismissed: "Avvisad",
  };

export const problemReportReasonValidator = v.union(
  v.literal("wrong_problem"),
  v.literal("wrong_answer"),
  v.literal("missing_figure"),
  v.literal("wrong_formatting"),
  v.literal("other"),
);

export const problemReportStatusValidator = v.union(
  v.literal("open"),
  v.literal("resolved"),
  v.literal("dismissed"),
);

export const MAX_REPORT_DETAILS_LENGTH = 2000;
export const MAX_ADMIN_NOTE_LENGTH = 2000;
export const MAX_ADMIN_REPORTS_LIST = 100;
