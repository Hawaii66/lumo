import { v } from "convex/values";
import { z } from "zod";

export const textPartSchema = z.object({
  type: z.literal("text"),
  content: z.string(),
  /** Optional name for this value within a task, e.g. "Mgn", "summa". */
  caption: z.string().min(1).optional(),
});

export const latexPartSchema = z.object({
  type: z.literal("latex"),
  content: z.string(),
  display: z.enum(["inline", "block"]).optional(),
  /** Optional name for this value within a task, e.g. "Mgn", "summa". */
  caption: z.string().min(1).optional(),
});

export const quickRepliesPartSchema = z.object({
  type: z.literal("quickReplies"),
  choices: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
      }),
    )
    .min(1),
});

export const subproblemPartSchema = z.object({
  type: z.literal("subproblem"),
  label: z.string().min(1),
});

/** Answer-case / branch marker (condition cases), not a task letter. */
export const casePartSchema = z.object({
  type: z.literal("case"),
  /** Optional short label ("1", "2", …); empty when unlabeled. */
  label: z.string().optional(),
});

export const lumoPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  latexPartSchema,
  quickRepliesPartSchema,
  subproblemPartSchema,
  casePartSchema,
]);

/** Zod schema for agent.generateObject — Lumo content envelope. */
export const lumoDocumentSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoPartSchema).min(1),
});

export type LumoDocument = z.infer<typeof lumoDocumentSchema>;
export type LumoPart = z.infer<typeof lumoPartSchema>;

/**
 * Flat part schema for OpenAI/OpenRouter structured output.
 * - No discriminatedUnion → avoids JSON Schema `oneOf` (OpenAI rejects).
 * - Unused fields must be empty string / empty arrays.
 */
export const lumoQuickReplyChoiceAzureSchema = z.object({
  id: z.string().describe("Choice id; empty when unused"),
  label: z
    .string()
    .describe(
      "Student question sent as next user message; empty when unused",
    ),
});

export const lumoPartAzureSchema = z.object({
  type: z
    .enum(["text", "latex", "quickReplies", "subproblem", "case"])
    .describe("Part kind"),
  content: z
    .string()
    .describe(
      "text=Swedish only (never TeX); latex=math only (never Swedish/\\\\text); else empty",
    ),
  display: z
    .enum(["inline", "block"])
    .describe("Latex display; use inline when type is not latex"),
  caption: z
    .string()
    .describe("Optional value name (Mgn, summa); empty when unused"),
  label: z
    .string()
    .describe(
      "subproblem letter a/b/c; case '1'/'2'/… or empty; otherwise empty",
    ),
  choices: z
    .array(lumoQuickReplyChoiceAzureSchema)
    .describe(
      "quickReplies: concrete student questions to the AI; empty when unused",
    ),
});

export const lumoDocumentAzureSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoPartAzureSchema).min(1),
});

export type LumoDocumentAzure = z.infer<typeof lumoDocumentAzureSchema>;
export type LumoPartAzure = z.infer<typeof lumoPartAzureSchema>;

function optionalCaption(raw: string): string | undefined {
  const caption = raw.trim();
  return caption.length > 0 ? caption : undefined;
}

/** Convert flat OpenAI structured-output parts into the stored Lumo shape. */
export function normalizeLumoPart(part: LumoPartAzure): LumoPart | null {
  switch (part.type) {
    case "text": {
      const content = part.content.trim();
      if (content.length === 0) return null;
      const caption = optionalCaption(part.caption);
      return caption !== undefined
        ? { type: "text", content, caption }
        : { type: "text", content };
    }
    case "latex": {
      const content = part.content.trim();
      if (content.length === 0) return null;
      const caption = optionalCaption(part.caption);
      return caption !== undefined
        ? { type: "latex", content, display: part.display, caption }
        : { type: "latex", content, display: part.display };
    }
    case "quickReplies": {
      const choices = [];
      for (const choice of part.choices) {
        const id = choice.id.trim();
        const label = choice.label.trim();
        if (id.length === 0 || label.length === 0) continue;
        choices.push({ id, label });
      }
      if (choices.length === 0) return null;
      return { type: "quickReplies", choices };
    }
    case "subproblem": {
      const label = part.label.trim().toLowerCase();
      if (label.length === 0) return null;
      return { type: "subproblem", label };
    }
    case "case": {
      const label = part.label.trim();
      return label.length > 0 ? { type: "case", label } : { type: "case" };
    }
  }
}

export function normalizeLumoDocument(raw: LumoDocumentAzure): LumoDocument {
  const parts = raw.parts
    .map(normalizeLumoPart)
    .filter((part): part is LumoPart => part !== null);
  if (parts.length === 0) {
    return {
      version: 1,
      parts: [
        {
          type: "text",
          content:
            "Jag kunde inte skapa ett giltigt svar. Försök skicka meddelandet igen.",
        },
      ],
    };
  }
  return { version: 1, parts };
}

/**
 * Static textbook content: text + latex + subproblem/case markers.
 * Used when converting parsed PDF problems (no chat UI parts).
 */
export const lumoStaticPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  latexPartSchema,
  subproblemPartSchema,
  casePartSchema,
]);

export const lumoStaticDocumentSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoStaticPartSchema).min(1),
});

/** Answer may be empty when the source has no facit for a problem. */
export const lumoStaticAnswerDocumentSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoStaticPartSchema),
});

/**
 * One textbook problem in Lumo language: shared problem number with
 * question/answer documents that use `subproblem` parts for (a)/(b)/…
 */
export const lumoParsedProblemSchema = z.object({
  problemNumber: z
    .string()
    .min(1)
    .describe("Problemnummer utan bokstav, t.ex. '1.1' (inte '1.1a')"),
  question: lumoStaticDocumentSchema.describe(
    "Frågan i Lumo-format. Deluppgifter = subproblem; fallgrenar i svar = case.",
  ),
  answer: lumoStaticAnswerDocumentSchema.describe(
    "Svaret i Lumo-format. Samma subproblem-etiketter som frågan när det finns tasks; case för villkorsfall. Tom parts om saknas.",
  ),
});

export type LumoStaticPart = z.infer<typeof lumoStaticPartSchema>;
export type LumoStaticDocument = z.infer<typeof lumoStaticDocumentSchema>;
export type LumoParsedProblem = z.infer<typeof lumoParsedProblemSchema>;

/**
 * Flat part schema for Azure/OpenAI structured output.
 * - No discriminatedUnion → avoids JSON Schema `oneOf` (Azure rejects).
 * - All fields required → Azure requires every key in `properties` to be in `required`.
 *   Unused fields must be empty string (or "inline"/"block" for display).
 */
export const lumoStaticPartAzureSchema = z.object({
  type: z
    .enum(["text", "latex", "subproblem", "case"])
    .describe(
      "text=Swedish; latex=math; subproblem=task (a)/(b); case=answer-case/branch (not a task)",
    ),
  content: z
    .string()
    .describe(
      "Swedish only for text (never \\\\frac/TeX); LaTeX only for latex (keep full inequalities e.g. a<\\\\frac{81}{4}); empty for subproblem/case.",
    ),
  display: z
    .enum(["inline", "block"])
    .describe("Latex display mode; use inline when type is not latex"),
  label: z
    .string()
    .describe(
      "subproblem: task letter a/b/c; case: optional '1'/'2'/… or empty; otherwise empty. Never Mgn/summa here",
    ),
  caption: z
    .string()
    .describe(
      "Optional value name (e.g. Mgn, summa) for text/latex; empty for subproblem/case",
    ),
});

export const lumoParsedProblemAzureSchema = z.object({
  problemNumber: z
    .string()
    .min(1)
    .describe("Problemnummer utan bokstav, t.ex. '1.1' (inte '1.1a' eller 'P 1.1')"),
  question: z.object({
    version: z.literal(1),
    parts: z
      .array(lumoStaticPartAzureSchema)
      .min(1)
      .describe(
        "Frågans delar. subproblem endast för skilda tasks (a)/(b); indexerad matte som P_{1} i latex; efter varje subproblem MÅSTE text/latex följa",
      ),
  }),
  answer: z.object({
    version: z.literal(1),
    parts: z
      .array(lumoStaticPartAzureSchema)
      .describe(
        "Svarets delar. SPEGLA frågans subproblem a/b/… 1:1 (aldrig case i stället för (a)/(b)); case endast för villkorsgrenar inuti en task; caption för Mgn/summa; tom om saknas",
      ),
  }),
});

export type LumoStaticPartAzure = z.infer<typeof lumoStaticPartAzureSchema>;
export type LumoParsedProblemAzure = z.infer<
  typeof lumoParsedProblemAzureSchema
>;

export function normalizeLumoStaticPart(
  part: LumoStaticPartAzure,
): LumoStaticPart | null {
  switch (part.type) {
    case "text": {
      const content = part.content.trim();
      if (content.length === 0) return null;
      const caption = optionalCaption(part.caption);
      return caption !== undefined
        ? { type: "text", content, caption }
        : { type: "text", content };
    }
    case "latex": {
      const content = part.content.trim();
      if (content.length === 0) return null;
      const caption = optionalCaption(part.caption);
      return caption !== undefined
        ? { type: "latex", content, display: part.display, caption }
        : { type: "latex", content, display: part.display };
    }
    case "subproblem": {
      const label = part.label.trim().toLowerCase();
      if (label.length === 0) return null;
      return { type: "subproblem", label };
    }
    case "case": {
      const label = part.label.trim();
      return label.length > 0 ? { type: "case", label } : { type: "case" };
    }
  }
}

function isSectionMarker(
  part: LumoStaticPart,
): part is Extract<LumoStaticPart, { type: "subproblem" | "case" }> {
  return part.type === "subproblem" || part.type === "case";
}

/**
 * Drop orphan markers and duplicate subproblem letters.
 * Cases are kept separately (each branch); subproblem letters appear at most once.
 * subproblem immediately followed by case is valid (cases belong under that task).
 */
export function repairStaticParts(
  parts: Array<LumoStaticPart>,
): Array<LumoStaticPart> {
  const out: Array<LumoStaticPart> = [];
  const seenTaskLabels = new Set<string>();

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (!isSectionMarker(part)) {
      out.push(part);
      continue;
    }

    const next = parts[i + 1];
    if (next === undefined) {
      continue;
    }
    // Empty marker: next is also a marker, except subproblem → case (valid nesting).
    if (isSectionMarker(next) && !(part.type === "subproblem" && next.type === "case")) {
      continue;
    }

    if (part.type === "subproblem") {
      if (seenTaskLabels.has(part.label)) {
        continue;
      }
      seenTaskLabels.add(part.label);
    }

    out.push(part);
  }

  while (out.length > 0 && isSectionMarker(out[out.length - 1]!)) {
    out.pop();
  }
  return out;
}

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

const LOSNING_SAKNAS_RE = /^lösning saknas\.?$/i;

function isOnlyLosningSaknas(parts: Array<LumoStaticPart>): boolean {
  const content = parts.filter((p) => !isSectionMarker(p));
  return (
    content.length > 0 &&
    content.every(
      (p) => p.type === "text" && LOSNING_SAKNAS_RE.test(p.content.trim()),
    )
  );
}

/**
 * Keep "Lösning saknas" only as the sole content of a task (source said so).
 * Drop it when the model invented it alongside real latex/text.
 */
export function dropSpuriousLosningSaknas(
  parts: Array<LumoStaticPart>,
): Array<LumoStaticPart> {
  const out: Array<LumoStaticPart> = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.type === "text" && LOSNING_SAKNAS_RE.test(part.content.trim())) {
      const prev = out[out.length - 1];
      const next = parts[i + 1];
      const soleForSection =
        prev !== undefined &&
        isSectionMarker(prev) &&
        (next === undefined || isSectionMarker(next));
      if (soleForSection) {
        out.push(part);
      }
      continue;
    }
    out.push(part);
  }
  return out;
}

/** Strip leading "P 1.2" / "P1.2" from raw answer text for salvage fallback. */
export function stripProblemNumberPrefix(text: string): string {
  return text.replace(/^\s*P\s*\d+\.\d+\s*/i, "").trim();
}

/** Bare leftover task markers the model left as text, e.g. "(b)" or "divideras med (a)". */
const BARE_TASK_MARKER_RE =
  /^(?:[,;.]?\s*)?(?:divideras med\s*)?\(?[a-d]\)?\.?$/i;
const PUNCT_ONLY_RE = /^[.,;:]+$/;

function tidyExtractedLatex(raw: string): string {
  return raw
    .replace(/−/g, "-")
    .replace(/\s*\.\s*$/, "")
    .replace(/\s*\^\s*\{\s*/g, "^{")
    .replace(/\s*_\s*\{\s*/g, "_{")
    .replace(/\s+\}/g, "}")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ ([+\-*=])/g, "$1")
    .replace(/([+\-*=]) /g, "$1");
}

/**
 * Pull "(a) expr (b) expr …" pairs from raw OCR (used when the model
 * emitted task labels but dropped the following math).
 */
export function extractInlineTaskMath(
  rawText: string,
): Map<string, string> {
  const map = new Map<string, string>();
  const re = /\(([a-z])\)\s*((?:(?!\([a-z]\)).)+)/gi;
  for (const match of rawText.matchAll(re)) {
    const label = match[1]!.toLowerCase();
    const math = tidyExtractedLatex(match[2] ?? "");
    if (math.length === 0) continue;
    // Skip math-looking parentheticals that are not task labels (e.g. already handled).
    if (!map.has(label)) {
      map.set(label, math);
    }
  }
  return map;
}

function dropBareTaskMarkerText(
  parts: Array<LumoStaticPart>,
): Array<LumoStaticPart> {
  const out: Array<LumoStaticPart> = [];
  for (const part of parts) {
    if (part.type !== "text") {
      out.push(part);
      continue;
    }
    const trimmed = part.content.trim();
    if (PUNCT_ONLY_RE.test(trimmed)) {
      continue;
    }
    const divideras = trimmed.match(/^divideras med\s*\(?[a-z]\)?\.?$/i);
    if (divideras) {
      out.push({ type: "text", content: "divideras med" });
      continue;
    }
    if (BARE_TASK_MARKER_RE.test(trimmed)) {
      continue;
    }
    out.push(part);
  }
  return out;
}

/**
 * When mid-sentence tasks lost their math (1.25-style), reinject latex from raw OCR.
 */
export function repairInlineTaskLatex(
  parts: Array<LumoStaticPart>,
  rawText: string,
): Array<LumoStaticPart> {
  const cleaned = dropBareTaskMarkerText(parts);
  const taskMath = extractInlineTaskMath(rawText);
  if (taskMath.size === 0) {
    return cleaned;
  }

  const out: Array<LumoStaticPart> = [];
  for (let i = 0; i < cleaned.length; i++) {
    const part = cleaned[i]!;
    out.push(part);
    if (part.type !== "subproblem") {
      continue;
    }

    let j = i + 1;
    let hasLatex = false;
    while (j < cleaned.length && !isSectionMarker(cleaned[j]!)) {
      if (cleaned[j]!.type === "latex") {
        hasLatex = true;
        break;
      }
      j += 1;
    }
    if (hasLatex) {
      continue;
    }
    const math = taskMath.get(part.label);
    if (math !== undefined && math.length > 0) {
      out.push({ type: "latex", content: math, display: "inline" });
    }
  }
  return out;
}

function finalizeStaticParts(
  parts: Array<LumoStaticPart>,
  rawText: string,
): Array<LumoStaticPart> {
  return repairInlineTaskLatex(repairStaticParts(parts), rawText);
}

export function normalizeLumoParsedProblem(
  raw: LumoParsedProblemAzure,
  fallbackQuestionText: string,
  rawAnswerText = "",
): LumoParsedProblem {
  const questionParts = finalizeStaticParts(
    raw.question.parts
      .map(normalizeLumoStaticPart)
      .filter((p): p is LumoStaticPart => p !== null),
    fallbackQuestionText,
  );
  let answerParts = dropSpuriousLosningSaknas(
    finalizeStaticParts(
      raw.answer.parts
        .map(normalizeLumoStaticPart)
        .filter((p): p is LumoStaticPart => p !== null),
      rawAnswerText,
    ),
  );

  const salvagedAnswer = stripProblemNumberPrefix(rawAnswerText);
  if (
    salvagedAnswer.length > 0 &&
    (answerParts.length === 0 || isOnlyLosningSaknas(answerParts))
  ) {
    // Model dropped a real facit — keep the raw answer rather than "Lösning saknas".
    answerParts = [{ type: "text", content: salvagedAnswer }];
  }

  return {
    problemNumber: normalizeProblemNumber(raw.problemNumber, fallbackQuestionText),
    question: {
      version: 1,
      parts:
        questionParts.length > 0
          ? questionParts
          : [{ type: "text", content: fallbackQuestionText }],
    },
    answer: {
      version: 1,
      parts: answerParts,
    },
  };
}

export const lumoTextPartValidator = v.object({
  type: v.literal("text"),
  content: v.string(),
  caption: v.optional(v.string()),
});

export const lumoLatexPartValidator = v.object({
  type: v.literal("latex"),
  content: v.string(),
  display: v.optional(v.union(v.literal("inline"), v.literal("block"))),
  caption: v.optional(v.string()),
});

export const lumoSubproblemPartValidator = v.object({
  type: v.literal("subproblem"),
  label: v.string(),
});

export const lumoCasePartValidator = v.object({
  type: v.literal("case"),
  label: v.optional(v.string()),
});

export const lumoStaticPartValidator = v.union(
  lumoTextPartValidator,
  lumoLatexPartValidator,
  lumoSubproblemPartValidator,
  lumoCasePartValidator,
);

export const lumoStaticDocumentValidator = v.object({
  version: v.literal(1),
  parts: v.array(lumoStaticPartValidator),
});

export const lumoParsedProblemValidator = v.object({
  problemNumber: v.string(),
  question: v.object({
    version: v.literal(1),
    parts: v.array(lumoStaticPartValidator),
  }),
  answer: lumoStaticDocumentValidator,
});

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

/** Chat documents no longer use interactive blanks; always valid. */
export function validateLumoDocument(_doc: LumoDocument): string | null {
  return null;
}

export function stringifyLumoDocument(doc: LumoDocument): string {
  return JSON.stringify(doc);
}

/** Flatten static textbook parts into a prompt-friendly string for the agent. */
export function serializeStaticDocumentForPrompt(
  doc: LumoStaticDocument | { version: 1; parts: Array<LumoStaticPart> },
): string {
  const chunks: Array<string> = [];
  for (const part of doc.parts) {
    switch (part.type) {
      case "text":
        chunks.push(part.content);
        break;
      case "latex":
        chunks.push(`$${part.content}$`);
        break;
      case "subproblem":
        chunks.push(`\n(${part.label})\n`);
        break;
      case "case":
        chunks.push(
          part.label ? `\n[Fall ${part.label}]\n` : "\n[Fall]\n",
        );
        break;
    }
  }
  return chunks.join("").trim();
}

/** Pass 1: plain worked math (no Lumo UI / placeholders). */
export const workedSolutionStepSchema = z.object({
  latex: z
    .string()
    .describe(
      "Fully filled math-only LaTeX for this step (no placeholders, no Swedish, no \\\\text)",
    ),
  note: z
    .string()
    .describe(
      "Optional short Swedish prose explaining WHY; empty when unused; never TeX",
    ),
});

export const workedSubproblemSchema = z.object({
  label: z
    .string()
    .describe('Subproblem letter "a"/"b"/… or "" when there are no (a)/(b)'),
  steps: z
    .array(workedSolutionStepSchema)
    .describe(
      "Ordered intermediate expressions, each fully filled and algebraically correct",
    ),
  finalLatex: z
    .string()
    .describe(
      "Final answer math-only LaTeX (fully filled; must match book facit when given)",
    ),
});

export const workedSolutionSchema = z.object({
  subproblems: z
    .array(workedSubproblemSchema)
    .min(1)
    .describe(
      'One entry per asked (a)/(b)/…; use a single entry with label "" when undivided',
    ),
});

export type WorkedSolution = z.infer<typeof workedSolutionSchema>;
export type WorkedSubproblem = z.infer<typeof workedSubproblemSchema>;

/** Human-readable worked solution for the format pass (easier to copy than raw JSON). */
export function serializeWorkedSolutionForPrompt(
  solution: WorkedSolution,
): string {
  const blocks: Array<string> = [];
  for (const sp of solution.subproblems) {
    const label = sp.label.trim().length > 0 ? sp.label.trim() : "(hela)";
    const lines: Array<string> = [`### Del ${label}`];
    sp.steps.forEach((step, i) => {
      const note =
        step.note.trim().length > 0 ? `  // ${step.note.trim()}` : "";
      lines.push(`Steg ${i + 1}: ${step.latex}${note}`);
    });
    lines.push(`Slutsvar: ${sp.finalLatex}`);
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n");
}
