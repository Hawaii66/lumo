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
});

export type LumoParsedProblem = z.infer<typeof lumoParsedProblemSchema>;

export const lumoParsedProblemValidator = v.object({
  problemNumber: v.string(),
  question: v.string(),
  answer: v.string(),
});

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

/**
 * Normalize model output into stored markdown problem fields.
 * Salvages raw answer text when the model dropped a real facit.
 */
export function normalizeLumoParsedProblem(
  raw: {
    problemNumber: string;
    question: string;
    answer: string;
  },
  fallbackQuestionText: string,
  rawAnswerText = "",
): LumoParsedProblem {
  const question = raw.question.trim();
  let answer = raw.answer.trim();

  const salvagedAnswer = stripProblemNumberPrefix(rawAnswerText);
  if (
    salvagedAnswer.length > 0 &&
    (answer.length === 0 || LOSNING_SAKNAS_RE.test(answer))
  ) {
    answer = salvagedAnswer;
  }

  return {
    problemNumber: normalizeProblemNumber(
      raw.problemNumber,
      fallbackQuestionText,
    ),
    question: question.length > 0 ? question : fallbackQuestionText.trim(),
    answer,
  };
}

export const helpLevelValidator = v.union(
  v.literal("minimal"),
  v.literal("explain"),
  v.literal("solve"),
  v.literal("practice"),
);

export type HelpLevel = "minimal" | "explain" | "solve" | "practice";

/** Per-chat interaction mode (stored on the thread). */
export const chatModeValidator = v.union(
  v.literal("normal"),
  v.literal("genomgang"),
);

export type ChatMode = "normal" | "genomgang";

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

export function stringifyChatReply(reply: ChatReply): string {
  return JSON.stringify(reply);
}
