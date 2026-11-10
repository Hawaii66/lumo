import { v } from "convex/values";
import { z } from "zod";

/** Chat assistant envelope: markdown body + optional quick-reply sidecar. */
export const chatQuickReplyChoiceSchema = z.object({
  id: z.string().min(1).describe("Stable choice id"),
  label: z
    .string()
    .min(1)
    .describe("Student question sent as the next user message"),
});

export const chatReplySchema = z.object({
  version: z.literal(2),
  markdown: z
    .string()
    .describe(
      "Pedagogical reply in markdown; math only in $...$ or $$...$$ (never \\( \\) / \\[ \\])",
    ),
  quickReplies: z
    .array(chatQuickReplyChoiceSchema)
    .max(4)
    .describe("0–4 concrete follow-up questions the student can click"),
});

export type ChatReply = z.infer<typeof chatReplySchema>;
export type ChatQuickReplyChoice = z.infer<typeof chatQuickReplyChoiceSchema>;

/**
 * Flat flag object (not discriminatedUnion) so Azure structured output
 * accepts the JSON Schema — Azure rejects `oneOf` on array items.
 * data is always {}; widen later if a kind needs payload fields.
 */
export const problemFlagSchema = z.object({
  kind: z
    .enum(["needs_pdf", "missing_answer"])
    .describe(
      "needs_pdf om frågan kräver figur/graf/tabell i PDF; missing_answer om facit saknas",
    ),
  data: z.object({}).describe("Alltid tomt objekt {}"),
});

export type ProblemFlag = z.infer<typeof problemFlagSchema>;

export const problemFlagValidator = v.union(
  v.object({
    kind: v.literal("needs_pdf"),
    data: v.object({}),
  }),
  v.object({
    kind: v.literal("missing_answer"),
    data: v.object({}),
  }),
);

const PROBLEM_FLAG_KIND_ORDER = ["needs_pdf", "missing_answer"] as const;

/** One textbook problem: markdown question + answer. */
export const lumoParsedProblemSchema = z.object({
  problemNumber: z
    .string()
    .min(1)
    .describe("Problemnummer utan bokstav, t.ex. '1.1' (inte '1.1a')"),
  question: z
    .string()
    .describe("Frågan i markdown med $ / $$; ### (a) för deluppgifter"),
  answer: z
    .string()
    .describe(
      "Svaret i markdown med $ / $$; spegla ### (a)/(b); tom sträng om saknas",
    ),
  // Required (use []) — Azure structured output demands every properties key in required.
  flags: z
    .array(problemFlagSchema)
    .describe(
      "Alltid en array (tom [] om inget). needs_pdf om frågan kräver figur/graf/tabell/diagram/bild i PDF; missing_answer om facit saknas. data är alltid {}.",
    ),
});

export type LumoParsedProblem = {
  problemNumber: string;
  question: string;
  answer: string;
  flags: Array<ProblemFlag>;
  /** First 0-based PDF page of the question stem (from MinerU parse). */
  sourceQuestionPageIdx?: number;
  /** First 0-based PDF page of the answer/facit (from MinerU parse). */
  sourceAnswerPageIdx?: number;
};

export const lumoParsedProblemValidator = v.object({
  problemNumber: v.string(),
  question: v.string(),
  answer: v.string(),
  flags: v.array(problemFlagValidator),
  sourceQuestionPageIdx: v.optional(v.number()),
  sourceAnswerPageIdx: v.optional(v.number()),
});

/** Twin step 1: new question only (facit comes from a separate solve call). */
export const lumoTwinVariantSchema = z.object({
  problemNumber: z
    .string()
    .min(1)
    .describe("Exakt problemnummer från prompten, t.ex. '1.1·T1'"),
  question: z
    .string()
    .min(1)
    .describe("Tvillingfrågan i markdown med $ / $$; ### (a) för deluppgifter"),
});

export type LumoTwinVariant = z.infer<typeof lumoTwinVariantSchema>;

/** Twin step 2: final facit only for the new question (no original answer in context). */
export const lumoTwinAnswerSchema = z.object({
  answer: z
    .string()
    .min(1)
    .describe(
      "ENBART slutfacit i markdown med $ / $$; spegla ### (a)/(b); inga lösningssteg; aldrig tom eller 'Lösning saknas'",
    ),
});
export type LumoTwinAnswer = z.infer<typeof lumoTwinAnswerSchema>;

/** Strip leading "P" and keep the first N.M number. */
export function normalizeProblemNumber(
  raw: string,
  fallback: string,
): string {
  const fromRaw = raw.trim().match(/(\d+\.\d+)/);
  if (fromRaw?.[1]) return fromRaw[1];
  const fromFallback = fallback.trim().match(/(\d+\.\d+)/);
  if (fromFallback?.[1]) return fromFallback[1];
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : fallback.trim();
}

/** Strip leading "P 1.2" / "P1.2" from raw answer text for salvage fallback. */
export function stripProblemNumberPrefix(text: string): string {
  return text.replace(/^\s*P\s*\d+\.\d+\s*/i, "").trim();
}

const LOSNING_SAKNAS_RE = /^lösning saknas\.?$/i;

/** Stem cues that usually mean a figure/graph/table lives only in the PDF. */
const NEEDS_PDF_CUE_RE =
  /\b(?:grafen|graf|figuren|figur|tabellen|tabell|diagrammet|diagram|bilden|bild)\b/i;

/** True when answer is empty or the forbidden placeholder. */
export function isMissingAnswer(answer: string): boolean {
  const trimmed = answer.trim();
  return trimmed.length === 0 || LOSNING_SAKNAS_RE.test(trimmed);
}

function dedupeProblemFlags(flags: Array<ProblemFlag>): Array<ProblemFlag> {
  const byKind = new Map<ProblemFlag["kind"], ProblemFlag>();
  for (const flag of flags) {
    byKind.set(flag.kind, flag);
  }
  return PROBLEM_FLAG_KIND_ORDER.flatMap((kind) => {
    const flag = byKind.get(kind);
    return flag === undefined ? [] : [flag];
  });
}

/**
 * Merge model flags with deterministic post-checks.
 * At most one flag per kind; model entries are kept when both fire.
 */
export function applyProblemFlags(
  flags: Array<ProblemFlag> | undefined,
  question: string,
  answer: string,
  rawQuestionText: string,
): Array<ProblemFlag> {
  const merged: Array<ProblemFlag> = [...(flags ?? [])];

  if (isMissingAnswer(answer)) {
    merged.push({ kind: "missing_answer", data: {} });
  }

  const cueText = `${rawQuestionText}\n${question}`;
  if (NEEDS_PDF_CUE_RE.test(cueText)) {
    merged.push({ kind: "needs_pdf", data: {} });
  }

  return dedupeProblemFlags(merged);
}

/**
 * Normalize model output into stored markdown problem fields.
 * Salvages raw answer text when the model dropped a real facit.
 * Do NOT use salvage for twin/shadow problems — pass empty rawAnswerText
 * and reject missing answers instead.
 */
export function normalizeLumoParsedProblem(
  raw: {
    problemNumber: string;
    question: string;
    answer: string;
    flags: Array<ProblemFlag>;
  },
  fallbackQuestionText: string,
  rawAnswerText = "",
): LumoParsedProblem {
  const question = raw.question.trim();
  let answer = raw.answer.trim();

  const salvagedAnswer = stripProblemNumberPrefix(rawAnswerText);
  if (salvagedAnswer.length > 0 && isMissingAnswer(answer)) {
    answer = salvagedAnswer;
  }

  const normalizedQuestion =
    question.length > 0 ? question : fallbackQuestionText.trim();

  return {
    problemNumber: normalizeProblemNumber(
      raw.problemNumber,
      fallbackQuestionText,
    ),
    question: normalizedQuestion,
    answer,
    flags: applyProblemFlags(
      raw.flags,
      normalizedQuestion,
      answer,
      fallbackQuestionText,
    ),
  };
}

/** Per-chat interaction mode (stored on the thread). */
export const chatModeValidator = v.union(
  v.literal("normal"),
  v.literal("genomgang"),
);

export type ChatMode = "normal" | "genomgang";

/**
 * Billable product feature that caused LLM spend.
 * Add literals here when new chargeable modes ship (e.g. exam_mode).
 */
export const chargeSourceValidator = v.union(
  v.literal("chat"),
  v.literal("twin_generation"),
);

export type ChargeSource = "chat" | "twin_generation";

export const CHARGE_SOURCES: Array<ChargeSource> = [
  "chat",
  "twin_generation",
];

export const DEFAULT_CHAT_MODE: ChatMode = "normal";

/** How long until a chat is eligible for auto-archive. Missing → infinite. */
export const chatDeletionExpiryValidator = v.union(
  v.literal("1h"),
  v.literal("3h"),
  v.literal("infinite"),
);

export type ChatDeletionExpiry = "1h" | "3h" | "infinite";

export const DEFAULT_CHAT_DELETION_EXPIRY: ChatDeletionExpiry = "infinite";
export const PROBLEM_CHAT_DELETION_EXPIRY: ChatDeletionExpiry = "3h";

const DELETION_EXPIRY_MS: Record<
  Exclude<ChatDeletionExpiry, "infinite">,
  number
> = {
  "1h": 60 * 60 * 1000,
  "3h": 3 * 60 * 60 * 1000,
};

/** Absolute archive-at timestamp, or undefined when the chat is kept forever. */
export function computeDeleteAt(
  expiry: ChatDeletionExpiry,
  now = Date.now(),
): number | undefined {
  if (expiry === "infinite") return undefined;
  return now + DELETION_EXPIRY_MS[expiry];
}
