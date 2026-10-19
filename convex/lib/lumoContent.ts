import { v } from "convex/values";
import { z } from "zod";

/** Matches empty MathLive placeholders: `\placeholder[id]{}` */
const PLACEHOLDER_ID_RE = /\\placeholder\[([^\]]+)\]\{\}/g;

export const promptSpecSchema = z.object({
  id: z.string().min(1),
  answer: z.string().min(1),
});

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

export const fillBlankPartSchema = z.object({
  type: z.literal("fillBlank"),
  prompt: z.string().optional(),
  latex: z.string(),
  prompts: z.array(promptSpecSchema).min(1),
});

/** Hint body: same text/latex split as other Lumo prose (no captions). */
export const hintPartSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    content: z.string(),
  }),
  z.object({
    type: z.literal("latex"),
    content: z.string(),
    display: z.enum(["inline", "block"]).optional(),
  }),
]);

export const solutionStepSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  hint: z.array(hintPartSchema),
  latex: z.string(),
  prompts: z.array(promptSpecSchema).min(1),
  solvedLatex: z.string(),
});

export const solutionPartSchema = z.object({
  type: z.literal("solution"),
  problemLatex: z.string(),
  steps: z.array(solutionStepSchema).min(1),
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
  fillBlankPartSchema,
  solutionPartSchema,
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
export type PromptSpec = z.infer<typeof promptSpecSchema>;
export type HintPart = z.infer<typeof hintPartSchema>;

/**
 * Flat part schema for OpenAI/OpenRouter structured output.
 * - No discriminatedUnion → avoids JSON Schema `oneOf` (OpenAI rejects).
 * - Unused fields must be empty string / empty arrays.
 */
export const lumoPromptSpecAzureSchema = z.object({
  id: z.string().describe("Placeholder id matching \\placeholder[id]{}"),
  answer: z.string().describe("Bare LaTeX answer; empty when unused"),
});

export const lumoHintPartAzureSchema = z.object({
  type: z
    .enum(["text", "latex"])
    .describe("text=Swedish prose; latex=math (no $)"),
  content: z
    .string()
    .describe(
      "Swedish only for text (never \\\\frac/TeX); LaTeX only for latex; empty when unused",
    ),
  display: z
    .enum(["inline", "block"])
    .describe("Latex display; use inline when type is not latex"),
});

export const lumoSolutionStepAzureSchema = z.object({
  id: z.string().describe("Step id; empty when unused"),
  title: z.string().describe("Step title; empty when unused"),
  hint: z
    .array(lumoHintPartAzureSchema)
    .describe(
      "Step hint as text/latex parts (split math like top-level parts); empty [] when unused",
    ),
  latex: z
    .string()
    .describe("Step latex with \\placeholder[id]{}; empty when unused"),
  prompts: z
    .array(lumoPromptSpecAzureSchema)
    .describe("Answers for placeholders; empty when unused"),
  solvedLatex: z.string().describe("Filled latex after solve; empty when unused"),
});

export const lumoQuickReplyChoiceAzureSchema = z.object({
  id: z.string().describe("Choice id; empty when unused"),
  label: z.string().describe("Button label; empty when unused"),
});

export const lumoPartAzureSchema = z.object({
  type: z
    .enum([
      "text",
      "latex",
      "fillBlank",
      "solution",
      "quickReplies",
      "subproblem",
      "case",
    ])
    .describe("Part kind"),
  content: z
    .string()
    .describe(
      "Swedish for text; LaTeX for latex (no $); empty for other types",
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
  prompt: z
    .string()
    .describe("Optional fillBlank intro text; empty when unused"),
  latex: z
    .string()
    .describe("fillBlank latex with placeholders; empty when unused"),
  prompts: z
    .array(lumoPromptSpecAzureSchema)
    .describe("fillBlank prompt answers; empty when unused"),
  problemLatex: z
    .string()
    .describe("solution problem statement latex; empty when unused"),
  steps: z
    .array(lumoSolutionStepAzureSchema)
    .describe("solution steps; empty when unused"),
  choices: z
    .array(lumoQuickReplyChoiceAzureSchema)
    .describe("quickReplies choices; empty when unused"),
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

function normalizePromptSpecs(
  prompts: Array<z.infer<typeof lumoPromptSpecAzureSchema>>,
): Array<PromptSpec> {
  const out: Array<PromptSpec> = [];
  for (const prompt of prompts) {
    const id = prompt.id.trim();
    const answer = prompt.answer.trim();
    if (id.length === 0 || answer.length === 0) continue;
    out.push({ id, answer });
  }
  return out;
}

function normalizeHintParts(
  parts: Array<z.infer<typeof lumoHintPartAzureSchema>>,
): Array<HintPart> {
  const out: Array<HintPart> = [];
  for (const part of parts) {
    const content = part.content.trim();
    if (content.length === 0) continue;
    if (part.type === "text") {
      out.push({ type: "text", content });
    } else {
      out.push({
        type: "latex",
        content,
        display: part.display === "block" ? "block" : "inline",
      });
    }
  }
  return out;
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
    case "fillBlank": {
      const latex = part.latex.trim();
      const prompts = normalizePromptSpecs(part.prompts);
      if (latex.length === 0 || prompts.length === 0) return null;
      const prompt = part.prompt.trim();
      return prompt.length > 0
        ? { type: "fillBlank", prompt, latex, prompts }
        : { type: "fillBlank", latex, prompts };
    }
    case "solution": {
      const steps = [];
      for (const step of part.steps) {
        const id = step.id.trim();
        const latex = step.latex.trim();
        const prompts = normalizePromptSpecs(step.prompts);
        const solvedLatex = step.solvedLatex.trim();
        if (id.length === 0 || latex.length === 0 || prompts.length === 0) {
          continue;
        }
        steps.push({
          id,
          title: step.title.trim(),
          hint: normalizeHintParts(step.hint),
          latex,
          prompts,
          solvedLatex,
        });
      }
      if (steps.length === 0) return null;
      return {
        type: "solution",
        problemLatex: part.problemLatex.trim(),
        steps,
      };
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
 * Used when converting parsed PDF problems (no interactive fillBlank/solution).
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
  v.literal("fillBlank"),
  v.literal("thoughtProcess"),
  v.literal("answerBoxes"),
);

export type ChatMode =
  | "normal"
  | "fillBlank"
  | "thoughtProcess"
  | "answerBoxes";

export const DEFAULT_CHAT_MODE: ChatMode = "normal";

/** How long until a chat is eligible for deletion. Missing → infinite. */
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

/** Absolute delete-at timestamp, or undefined when the chat is kept forever. */
export function computeDeleteAt(
  expiry: ChatDeletionExpiry,
  now = Date.now(),
): number | undefined {
  if (expiry === "infinite") return undefined;
  return now + DELETION_EXPIRY_MS[expiry];
}

export function extractPlaceholderIds(latex: string): Array<string> {
  const ids: Array<string> = [];
  for (const match of latex.matchAll(PLACEHOLDER_ID_RE)) {
    const id = match[1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function assertPlaceholdersMatchPrompts(
  latex: string,
  prompts: Array<PromptSpec>,
): string | null {
  const ids = extractPlaceholderIds(latex);
  const promptIds = prompts.map((p) => p.id);

  for (const id of ids) {
    if (!promptIds.includes(id)) {
      return `Placeholder "${id}" saknar svar i prompts`;
    }
  }
  for (const id of promptIds) {
    if (!ids.includes(id)) {
      return `Prompt "${id}" saknar \\placeholder[${id}]{} i latex`;
    }
  }
  return null;
}

export function validateLumoDocument(doc: LumoDocument): string | null {
  for (const part of doc.parts) {
    if (part.type === "fillBlank") {
      const err = assertPlaceholdersMatchPrompts(part.latex, part.prompts);
      if (err) return err;
    }
    if (part.type === "solution") {
      for (const step of part.steps) {
        const err = assertPlaceholdersMatchPrompts(step.latex, step.prompts);
        if (err) return `Steg ${step.id}: ${err}`;
      }
    }
  }
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

export const LUMO_PROTOCOL_INSTRUCTIONS = `Du är Lumo, en sokratisk studieassistent för matematik.
Svara på svenska om användaren skriver på svenska.
Svara med ETT JSON-objekt — ingen prosa, inga markdown-staket utanför JSON.

════════════════════════════════════════
OUTPUT-FORMAT  (platt schema — alla fält finns alltid)
════════════════════════════════════════
{
  "version": 1,
  "parts": [ /* en eller flera delar */ ]
}

Varje part har ALLA dessa fält. Fyll bara det som hör till typen; resten = "" eller [].

  type, content, display, caption, label,
  prompt, latex, prompts, problemLatex, steps, choices

display: "inline" eller "block" (använd "inline" när typen inte är latex).
prompts: [{ "id", "answer" }] — tom [] när oanvänd.
steps / choices: tom [] när oanvända.

════════════════════════════════════════
PART-TYPER
════════════════════════════════════════

type=text
  content : Enbart naturlig svenska/engelska — INGA backslash (\\\\).
            ✓ "Förenkla uttrycket", "Nästa steg är att isolera", "Bra fråga."
            ✗ Allt med \\\\  (\\\\frac, \\\\sqrt, \\\\neq, \\\\mathrm, \\\\text, …)
            ✗ ^{}, _{}, bråk, olikheter, rena matematiksymboler
            HARD RULE: Om content innehåller \\\\ → det FÅR INTE vara type=text.
              Flytta matten till type=latex (splitta text/latex/text).
  display : "inline"
  label, prompt, latex, problemLatex : ""
  caption : valfritt värdenamn ("Mgn", "summa"); "" annars
  prompts, steps, choices : []

type=latex
  content : Enbart LaTeX-matematik (utan $ eller $$).
            ✓ "a^{2}+b-c", "\\\\frac{1}{2}", "x\\\\neq 0", "P_{1}"
            ✗ Svenska som enda innehåll; \\\\text{…}; \\\\mathrm{Nej}
            HARD RULE: Svenska ord ("Ja", "Nej", "ingen lösning") → type=text,
              ALDRIG latex med \\\\mathrm / \\\\text runt dem.
  display : "inline" | "block"
  label, prompt, latex, problemLatex : ""
  caption : valfritt värdenamn; "" annars
  prompts, steps, choices : []

type=fillBlank  — interaktiv svarsruta / lucka studenten fyller i
  prompt  : kort svensk ledtext ovanför rutan, eller ""
  latex   : uttryck med TOMMA MathLive-placeholders: \\\\placeholder[id]{}
            ✓ "x=\\\\placeholder[x1]{}"
            ✗ "x=\\\\placeholder[x1]{2}"  ← svar får ALDRIG sitta i placeholder-kroppen
  prompts : [{ "id": "x1", "answer": "2" }]  — samma id:n som i latex; answer = bare LaTeX
  content, label, problemLatex, caption : ""
  display : "inline"
  steps, choices : []

type=solution  — guidad flerstegslösning där VARJE steg har luckor
  problemLatex : uppgiftens uttryck i LaTeX (utan $), eller ""
  steps : [{
    "id": "s1",
    "title": "Isolera x",
    "hint": [
      { "type": "text", "content": "Flytta konstanten till högerledet.", "display": "inline" }
    ],
    "latex": "x+3=\\\\placeholder[a]{}",
    "prompts": [{ "id": "a", "answer": "7" }],
    "solvedLatex": "x+3=7"
  }]
  hint : array av text/latex-delar (samma split-regler som top-level).
         Matematik i ledtråd MÅSTE vara type=latex — ALDRIG TeX i type=text.
         Tom [] om ingen ledtråd. Varje hint-part har type, content, display.
  Minst ett steg. Varje steg MÅSTE ha minst en \\\\placeholder[id]{} + matchande prompt.
  Ge INTE hela facit i title/hint — bara ledtråd.
  content, label, prompt, latex, caption : ""
  display : "inline"
  prompts, choices : []   (prompts ligger INUTI steps)

type=quickReplies  — klickbara snabbval (korta frågor / nästa steg)
  choices : [{ "id": "opt1", "label": "Visa ett tips" }, …]  — minst ett
  content, label, prompt, latex, problemLatex, caption : ""
  display : "inline"
  prompts, steps : []

type=subproblem  — markör för deluppgift (a)/(b)/(c)
  label   : "a" | "b" | "c" … — ALDRIG tom; ALDRIG värdenamn som "Mgn"
  content, prompt, latex, problemLatex, caption : ""
  display : "inline"
  prompts, steps, choices : []
  ⚠ MÅSTE följas av minst en text-, latex-, fillBlank- eller solution-part.

type=case  — villkorsfall / "om …"-gren (INTE samma som subproblem)
  label   : "1", "2", … eller ""
  content, prompt, latex, problemLatex, caption : ""
  display : "inline"
  prompts, steps, choices : []
  ⚠ MÅSTE följas av innehållspart direkt efter.

════════════════════════════════════════
TEXT vs LATEX — DELA ALLTID UPP
════════════════════════════════════════
Varje bråk (\\\\frac) och varje matematisk symbol MÅSTE vara type=latex.
Prosa runt matematik → splitta: text / latex / text / latex / …
Gäller både top-level parts OCH steps[].hint.

  RÄTT: text "Vi får", latex "x=\\\\frac{3}{4}", text "när", latex "t=2"
  FEL:  text "Vi får x=\\\\frac{3}{4} när t=2"
  FEL:  latex "\\\\text{Vi får }x=\\\\frac{3}{4}"
  FEL:  hint:[{type:"text", content:"… multiplicera med \\\\frac{1}{8}."}]

• Tappa ALDRIG vänsterledet: "a < 81/4" → latex "a<\\\\frac{81}{4}"
• Indexerade symboler (P_{1}, α_{1}) → alltid type=latex.
• Aldrig blanda svenska och TeX i samma part.

════════════════════════════════════════
FILLBLANK & ANSWER BOXES — NÄR OCH HUR
════════════════════════════════════════

fillBlank = en svarsruta (en ekvation/uttryck med en eller flera luckor).
solution  = flera steg där varje steg är en fillBlank-liknande lucka.

GEMENSAMMA REGLER FÖR LUCKOR:
1. Placeholder med TOM kropp: \\\\placeholder[id]{}
2. Rätt svar BARA i prompts[].answer (bare LaTeX: "2x", "\\\\frac{1}{2}", "3")
3. Varje id i latex ↔ exakt en prompt (inga överblivna)
4. Visa ALDRIG facit i text/hint/title samtidigt som luckan — studenten ska fylla i själv
5. En lucka = en sak studenten ska skriva (inte hela lösningen i en ruta om läget är guidad)

NÄR du ska använda vad (chattläget nedan styr — följ det strikt):
  • Ledtråd utan facit          → text (+ ev. quickReplies)
  • En slutlig svarsruta        → fillBlank
  • Guidad lösning steg för steg → solution (varje steg = lucka)
  • Ja/nej / välj väg           → quickReplies

════════════════════════════════════════
CHATTLÄGEN  (ges separat som "Chattläge: …" — FÖLJ EXAKT)
════════════════════════════════════════

normal
  • Sokratisk hjälp med text + latex.
  • fillBlank / solution BARA om studenten ber om luckor eller övning.
  • quickReplies OK för korta vägval.
  • Ge inte hela facit om studenten bara frågar "hur börjar jag?".

fillBlank
  • HUVUDSAK: solution med 2–5 steg (luckor i varje steg), ELLER fillBlank om uppgiften är kort.
  • Kort text-hint före/mellan steg tillåts — INGEN facit-prosa.
  • Inga "svaret blir x=…" i text. Facit lever bara i prompts[].answer / solvedLatex.

thoughtProcess
  • Fokus: hur man TÄNKER. text + latex som förklarar resonemanget.
  • Gärna solution eller fillBlank på kritiska mellansteg så studenten aktiveras.
  • Förklara VARFÖR varje steg, inte bara vad man skriver.

answerBoxes
  • BARA slutliga fillBlank-svarsrutor (en per deluppgift om (a)/(b) finns).
  • Högst 1–2 korta text-meningar som intro ("Fyll i svaren nedan.").
  • FÖRBJUDET: type=solution, långa genomgångar, facit i text.
  • Facit endast i prompts[].answer.

════════════════════════════════════════
PEDAGOGIK
════════════════════════════════════════
• Var sokratisk: led, fråga, låt studenten arbeta — dumpa inte facit i normal/fillBlank.
• Om uppgiftskontext ges: använd den. Hitta inte på andra uppgifter.
• Om läget förbjuder facit: håll prompts[].answer korrekt internt men avslöja det inte i text.
• subproblem när studenten jobbar med (a)/(b)/(c); annars undvik onödiga markörer.

════════════════════════════════════════
EXEMPEL  (✓ = bra, ✗ = dåligt)
════════════════════════════════════════

Ex 1 — text/latex-split:
  ✓ parts: text "Förenkla", latex "a^{2}+b-c", text "där", latex "c=1"
  ✗ parts: text "Förenkla a^{2}+b-c där c=1"
  ✗ parts: latex "\\\\text{Förenkla }a^{2}+b-c"

Ex 2 — fillBlank (en svarsruta):
  ✓ type=fillBlank,
      prompt="Lös för x",
      latex="x=\\\\placeholder[x1]{}",
      prompts=[{id:"x1", answer:"5"}]
  ✗ latex="x=\\\\placeholder[x1]{5}"          ← svar i placeholder-kroppen
  ✗ text "Svaret är x=5" + fillBlank utan lucka ← facit läckt i text

Ex 3 — solution (guidade steg, läge fillBlank):
  ✓ type=solution,
      problemLatex="2x+3=11",
      steps=[
        { id:"s1", title:"Flytta konstanten",
          hint:[{type:"text", content:"Subtrahera 3 från båda led.", display:"inline"}],
          latex="2x=\\\\placeholder[a]{}", prompts:[{id:"a", answer:"8"}],
          solvedLatex:"2x=8" },
        { id:"s2", title:"Isolera x",
          hint:[
            {type:"text", content:"Dividera med", display:"inline"},
            {type:"latex", content:"\\\\frac{1}{8}", display:"inline"},
            {type:"text", content:"är samma sak som att multiplicera.", display:"inline"}
          ],
          latex="x=\\\\placeholder[b]{}", prompts:[{id:"b", answer:"4"}],
          solvedLatex:"x=4" }
      ]
  ✗ hint som en sträng "… \\\\frac{1}{8} …"  ← hint MÅSTE vara text/latex-array
  ✗ ett enda steg med hela lösningen redan ifylld i hint
  ✗ type=text "Först blir 2x=8, sedan x=4" i fillBlank-läge

Ex 4 — answerBoxes (bara slutrutor):
  ✓ text "Fyll i svaren.",
     subproblem a, fillBlank latex="\\\\placeholder[a1]{}" prompts=[{id:"a1", answer:"2x"}],
     subproblem b, fillBlank latex="\\\\placeholder[b1]{}" prompts=[{id:"b1", answer:"x-1"}]
  ✗ type=solution med genomgång i answerBoxes-läge
  ✗ text som berättar facit före rutorna

Ex 5 — normal (förklaring utan tvingade luckor):
  ✓ text "Börja med att samla x-termer:", latex "3x-x=2x", text "Vad blir nästa steg?",
     quickReplies choices=[{id:"t1", label:"Visa ett tips"}, {id:"t2", label:"Visa en lucka"}]
  ✗ tvinga solution/fillBlank när läget är normal och studenten bara ställde en kort fråga

Ex 6 — placeholder-id måste matcha:
  ✓ latex="\\\\frac{\\\\placeholder[num]{}}{\\\\placeholder[den]{}}"
      prompts=[{id:"num", answer:"1"}, {id:"den", answer:"2"}]
  ✗ latex med [num] men prompts bara [{id:"den", …}]
  ✗ prompts med id som inte finns i latex

Ex 7 — thoughtProcess:
  ✓ text "Tanken är att få x ensamt. Vi har", latex "2x+3=11",
     text "Konstanten stör — flytta den först.",
     fillBlank prompt="Vad blir högerledet?", latex="2x=\\\\placeholder[r]{}",
       prompts=[{id:"r", answer:"8"}]
  ✗ bara dumpa facit utan resonemang
`;
