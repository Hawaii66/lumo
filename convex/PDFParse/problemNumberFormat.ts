import { v } from "convex/values";
import { z } from "zod";

/**
 * Structured problem-number pattern for one PDF.
 * Produced by the format-detect AI; consumed by the deterministic splitter.
 */
export const problemNumberFormatSchema = z.object({
  prefix: z
    .union([z.string(), z.null()])
    .describe(
      'Literal text before the number (e.g. "P", "Uppgift"), or null if the lead starts with the number',
    ),
  segmentCount: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .describe('Exact segment count: 1 → "3", 2 → "3.1", 3 → "1.2.1"'),
  requireTerminator: z
    .boolean()
    .describe(
      'True when the number must be followed by "." or ")" (typical for segmentCount 1)',
    ),
  pgaFormat: z
    .union([z.string(), z.null()])
    .describe(
      'Exact PGA label from the PDF such as "2(a)", "2a)", "1.2 a)", or null if none',
    ),
  titleBlocks: z
    .union([z.literal("never"), z.literal("when_matches")])
    .describe(
      "Whether paragraph_title/header leads may open a problem when they match the number pattern",
    ),
  answerSectionHeading: z
    .union([z.string(), z.null()])
    .describe(
      'Exact answer-section heading text from the PDF, or null if there is no dedicated header',
    ),
  allowNumberRestart: z
    .boolean()
    .describe(
      "If true, the first repeated problem number also starts the answer pass",
    ),
  examples: z
    .array(z.string())
    .describe("Example labels copied from the PDF (debug / soft validation)"),
});

export type ProblemNumberFormat = z.infer<typeof problemNumberFormatSchema>;

export const problemNumberFormatValidator = v.object({
  prefix: v.union(v.string(), v.null()),
  segmentCount: v.union(v.literal(1), v.literal(2), v.literal(3)),
  requireTerminator: v.boolean(),
  pgaFormat: v.union(v.string(), v.null()),
  titleBlocks: v.union(v.literal("never"), v.literal("when_matches")),
  answerSectionHeading: v.union(v.string(), v.null()),
  allowNumberRestart: v.boolean(),
  examples: v.array(v.string()),
});

/** Conservative default when the model output is unusable. */
export const FALLBACK_PROBLEM_NUMBER_FORMAT: ProblemNumberFormat = {
  prefix: null,
  segmentCount: 2,
  requireTerminator: true,
  pgaFormat: null,
  titleBlocks: "never",
  answerSectionHeading: null,
  allowNumberRestart: true,
  examples: [],
};

export type PgaStyle = "paren" | "glued" | "spaced";

export type ParsedPgaFormat = {
  style: PgaStyle;
  /** Segment count of the number part in the template. */
  numberSegments: number;
};

/**
 * Parse a PGA example like "2(a)", "2a)", "1.2 a)" into a matcher style.
 */
export function parsePgaFormat(
  pgaFormat: string | null,
): ParsedPgaFormat | null {
  if (pgaFormat === null) {
    return null;
  }
  const trimmed = pgaFormat.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const paren = /^(\d+(?:\.\d+)*)\s*\(([a-z])\)/i.exec(trimmed);
  if (paren !== null) {
    return {
      style: "paren",
      numberSegments: paren[1]!.split(".").length,
    };
  }

  const glued = /^(\d+(?:\.\d+)*)([a-z])\s*\)/i.exec(trimmed);
  if (glued !== null) {
    return {
      style: "glued",
      numberSegments: glued[1]!.split(".").length,
    };
  }

  const spaced = /^(\d+(?:\.\d+)*)\s+([a-z])\s*[.)]/i.exec(trimmed);
  if (spaced !== null) {
    return {
      style: "spaced",
      numberSegments: spaced[1]!.split(".").length,
    };
  }

  return null;
}

/** Normalize / validate model output; fall back on failure. */
export function normalizeProblemNumberFormat(
  raw: unknown,
): ProblemNumberFormat {
  const parsed = problemNumberFormatSchema.safeParse(raw);
  if (!parsed.success) {
    return { ...FALLBACK_PROBLEM_NUMBER_FORMAT };
  }
  const format = parsed.data;
  const prefix =
    format.prefix === null || format.prefix.trim().length === 0
      ? null
      : format.prefix.trim();
  const pgaFormat =
    format.pgaFormat === null || format.pgaFormat.trim().length === 0
      ? null
      : format.pgaFormat.trim();
  const answerSectionHeading =
    format.answerSectionHeading === null ||
    format.answerSectionHeading.trim().length === 0
      ? null
      : format.answerSectionHeading.trim();

  return {
    prefix,
    segmentCount: format.segmentCount,
    requireTerminator: format.requireTerminator,
    pgaFormat,
    titleBlocks: format.titleBlocks,
    answerSectionHeading,
    allowNumberRestart: format.allowNumberRestart,
    examples: format.examples.map((example) => example.trim()).filter(Boolean),
  };
}

/** Test/preset: dotted two-part numbers with a "Svar" answer header. */
export const FORMAT_DOTTED_2: ProblemNumberFormat = {
  prefix: null,
  segmentCount: 2,
  requireTerminator: false,
  pgaFormat: null,
  titleBlocks: "never",
  answerSectionHeading: "Svar",
  allowNumberRestart: true,
  examples: ["1.2", "2.1"],
};

/** Test/preset: major numbers with PGA facit like "1a)". */
export const FORMAT_MAJOR_PGA: ProblemNumberFormat = {
  prefix: null,
  segmentCount: 1,
  requireTerminator: true,
  pgaFormat: "1a)",
  titleBlocks: "never",
  answerSectionHeading: "Lösningsskisser",
  allowNumberRestart: true,
  examples: ["1.", "2."],
};

/** Test/preset: booklet "P x.y" labels. */
export const FORMAT_P_BOOKLET: ProblemNumberFormat = {
  prefix: "P",
  segmentCount: 2,
  requireTerminator: false,
  pgaFormat: null,
  titleBlocks: "never",
  answerSectionHeading: "Svar",
  allowNumberRestart: true,
  examples: ["P 3.1", "P 3.2"],
};

/** Test/preset: three-part title stems (TATA31 style). */
export const FORMAT_THREE_PART: ProblemNumberFormat = {
  prefix: null,
  segmentCount: 3,
  requireTerminator: false,
  pgaFormat: null,
  titleBlocks: "when_matches",
  answerSectionHeading: "Svar till övningarna",
  allowNumberRestart: true,
  examples: ["1.2.1", "1.2.2", "1.2.3"],
};

/** Test/preset: major numbers, number-restart answers, no heading. */
export const FORMAT_MAJOR_RESTART: ProblemNumberFormat = {
  prefix: null,
  segmentCount: 1,
  requireTerminator: true,
  pgaFormat: null,
  titleBlocks: "never",
  answerSectionHeading: null,
  allowNumberRestart: true,
  examples: ["1.", "6.", "7."],
};
