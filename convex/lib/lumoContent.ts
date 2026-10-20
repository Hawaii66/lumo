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
    .describe("text=Swedish prose only; latex=math only (no $)"),
  content: z
    .string()
    .describe(
      "text: Swedish only (never \\\\ / TeX); latex: math only (never Swedish/\\\\text); else empty",
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
      "Hint as split text/latex parts (never TeX in text); empty [] when unused",
    ),
  latex: z
    .string()
    .describe(
      "Step latex with empty \\\\placeholder[id]{} ({} required); substituting answers must equal solvedLatex",
    ),
  prompts: z
    .array(lumoPromptSpecAzureSchema)
    .describe("Answers for placeholders; empty when unused"),
  solvedLatex: z
    .string()
    .describe("Fully filled math-only latex after solve; empty when unused"),
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
  prompt: z
    .string()
    .describe("Optional fillBlank intro text; empty when unused"),
  latex: z
    .string()
    .describe(
      "fillBlank step latex with \\\\placeholder[id]{}; empty for solution and other types",
    ),
  prompts: z
    .array(lumoPromptSpecAzureSchema)
    .describe("fillBlank prompt answers; empty when unused"),
  problemLatex: z
    .string()
    .describe(
      "solution start expression math-only (no Swedish, no \\\\text); empty otherwise",
    ),
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
      const latex = repairPlaceholderLatex(part.latex.trim());
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
        const latex = repairPlaceholderLatex(step.latex.trim());
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

/**
 * MathLive requires `\placeholder[id]{}` (empty body group).
 * Models often emit `\placeholder[id]` which parses as doubled empty
 * boxes / stray squares inside fractions.
 */
export function repairPlaceholderLatex(latex: string): string {
  return latex.replace(
    /\\placeholder\[([^\]]*)\](?!\s*\{)/g,
    "\\placeholder[$1]{}",
  );
}

export function extractPlaceholderIds(latex: string): Array<string> {
  const ids: Array<string> = [];
  for (const match of repairPlaceholderLatex(latex).matchAll(
    PLACEHOLDER_ID_RE,
  )) {
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

/** Pass 1 — solve only. Mode hint is appended separately each turn. */
export const LUMO_SOLVE_INSTRUCTIONS = `Du är Lumo Solve: du RÄKNAR matematik korrekt.
Nästa steg (format) får bara presentera det du räknar ut — så din matte MÅSTE vara rätt.
Svara med ETT JSON-objekt enligt schemat — ingen markdown utanför JSON.

════════════════════════════════════════
SVARA PÅ STUDENTENS FRÅGA
════════════════════════════════════════
• Läs vad studenten faktiskt ber om (hela uppgiften, bara (a), "hur börjar jag?", "kolla mitt tecken", …).
• Lös det de frågar om. Om de bara frågar om (b) → ett subproblem med label "b" (skippa a).
• Om uppgiftskontext med facit ges: finalLatex MÅSTE vara samma matematiska svar som facit.
• Bygg mellansteg som algebraiskt LEDER till finalLatex — inte lösa steg som inte hör till frågan.

════════════════════════════════════════
LATEX vs NOTE  (strängt — samma princip som Lumo text/latex-split)
════════════════════════════════════════
• steps[].latex och finalLatex = ENBART matematik (utan $).
  ✓ "a^{2}+a-b-1", "y=5x-5-x^{2}", "4x^{2}-7x+6"
  ✗ svenska ord, "där", "och", \\\\text{…}, \\\\mathrm{Nej}, \\\\quad\\\\text{…}
• note = ENBART kort svensk prosa (eller "").
  ✓ "Byt tecken i varje term inuti parentesen."
  ✗ \\\\frac, ^{}, _{}, eller andra TeX-tecken i note

════════════════════════════════════════
MATEMATIK — KORREKTHET
════════════════════════════════════════
• Varje steps[].latex är HELT ifyllt. INGA \\\\placeholder. INGA Lumo-parttyper.
• Substitution med flera termer: sätt ALLTID parenteser.
  A − B när B = 1−a+2b  →  A-(1-a+2b)   (inte A-1-a+2b)
• Minus framför parentes: byt tecken EXAKT en gång per term.
  −(A − B − C) → −A + B + C
  −(1 − a + 2b) → −1 + a − 2b
  −(5x − 7 − (−2 + x^{2})) → −5x + 7 − 2 + x^{2}
  Vanligt fel: dubbla teckenbyte på inre parentes → FEL.
• Efter varje expansion: förenkla och kontrollera att steget ≡ föregående.
• Kedjan steps → finalLatex ska vara ekvivalent från startuttryck till facit.
• Deluppgifter (a)/(b)/(c) som ingår i svaret → ett subproblems-element per etikett, samma ordning.
• Utan deluppgifter → ett element med label "".

════════════════════════════════════════
CHATTLÄGE
════════════════════════════════════════
Ges separat som "Chattläge (lösning): …". Styr DJUP (antal mellansteg), inte JSON-format
och inte hur frontend visar luckor.`;

/**
 * Pass 1 mode hint — solution depth only (injected every turn from current thread mode).
 */
export function solveModeHint(mode: ChatMode): string {
  switch (mode) {
    case "normal":
      return `Chattläge (lösning): normal
• Ge finalLatex + de nyckelmellansteg som behövs för att hjälpa studenten.
• Hoppa mikroalgebra om kedjan fortfarande är tydlig och korrekt.`;
    case "fillBlank":
      return `Chattläge (lösning): fillBlank
• Ge 2–5 algebraiskt korrekta mellansteg per deluppgift (helt ifyllda latex).
• Varje steg ska vara ett uttryck format-passet kan lucka ur — tecken/parenteser korrekta.`;
    case "thoughtProcess":
      return `Chattläge (lösning): thoughtProcess
• Ge 2–5 mellansteg + korta note som förklarar VARFÖR steget gäller.
• Matten i latex måste vara korrekt; note ersätter aldrig uttrycket.`;
    case "answerBoxes":
      return `Chattläge (lösning): answerBoxes
• Fokus: korrekt finalLatex per deluppgift (matcha facit).
• Mellansteg minimala eller [] om svaret är direkt.`;
  }
}

/** Pass 2 — format a worked solution into Lumo document JSON for the frontend. */
export const LUMO_FORMAT_INSTRUCTIONS = `Du är Lumo Format: du PRESENTERAR en redan räknad lösning som Lumo-JSON.
Du räknar INTE om. Du kopierar matte och splittar text/latex korrekt.
Svara på svenska om användaren skriver på svenska.
Svara med ETT JSON-objekt — ingen prosa, inga markdown-staket utanför JSON.

════════════════════════════════════════
KÄLLA TILL SANNING
════════════════════════════════════════
• "INTERNT ARBETAD LÖSNING" är facit för matematiken (steg + slutsvar).
• Kopiera / lucka ur dessa uttryck. OMRÄKNA INTE tecken, parenteser eller termer.
• solvedLatex och prompts[].answer MÅSTE komma från den arbetade lösningen.
• Hitta inte på nya mellanuttryck. Saknas något: förenkla presentationen, ändra inte matten.
• Svara på studentens fråga med rätt deluppgifter från lösningen (a/b/… som ingår).

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
TEXT vs LATEX — DELA ALLTID UPP
════════════════════════════════════════
INGEN latex i text. INGEN text i latex. Splitta: text / latex / text / latex / …
Gäller top-level parts, steps[].hint, OCH alla latex-fält (problemLatex, latex, solvedLatex).

type=text  → enbart naturlig svenska/engelska — INGA backslash (\\\\).
  ✓ "Förenkla", "där", "antas för", "Nästa steg:", "Ja", "Nej", "ingen lösning"
  ✗ \\\\frac, \\\\sqrt, \\\\neq, \\\\mathrm, \\\\text, ^{}, _{}, bråk, olikheter
  HARD: om content innehåller \\\\ → det FÅR INTE vara type=text. Flytta till latex.

type=latex  → enbart LaTeX-matematik (utan $ eller $$).
  ✓ "a^{2}+b-c", "\\\\frac{1}{2}", "x\\\\neq 0", "P_{1}", "c=1-a+2b"
  ✗ svenska ord; \\\\text{där}; \\\\mathrm{Nej}; \\\\quad\\\\text{och}
  HARD: svenska svarord → type=text, ALDRIG latex med \\\\text / \\\\mathrm runt dem.

  RÄTT: text "Vi får", latex "x=\\\\frac{3}{4}", text "när", latex "t=2"
  FEL:  text "Vi får x=\\\\frac{3}{4} när t=2"
  FEL:  latex "\\\\text{Vi får }x=\\\\frac{3}{4}"
  FEL:  problemLatex "a^{2}+b-c \\\\text{ där } c=1-a+2b"
  RÄTT problemLatex: "a^{2}+b-c"  +  egna text/latex-parts före solution för "där c=…"

• Tappa ALDRIG vänsterledet: "a < 81/4" → latex "a<\\\\frac{81}{4}"
• Indexerade symboler (P_{1}, α_{1}) → alltid type=latex.

════════════════════════════════════════
PART-TYPER
════════════════════════════════════════

type=text
  content : svensk/engelsk prosa (se split-regler ovan)
  display : "inline"
  label, prompt, latex, problemLatex : ""
  caption : valfritt värdenamn ("Mgn", "summa"); "" annars
  prompts, steps, choices : []

type=latex
  content : matematik (se split-regler ovan)
  display : "inline" | "block"
  label, prompt, latex, problemLatex : ""
  caption : valfritt värdenamn; "" annars
  prompts, steps, choices : []

type=fillBlank  — en interaktiv svarsruta
  prompt  : kort svensk ledtext, eller ""
  latex   : uttryck med TOMMA placeholders: \\\\placeholder[id]{}
            ✓ "x=\\\\placeholder[x1]{}"
            ✗ "x=\\\\placeholder[x1]{2}"  ← svar får ALDRIG sitta i {}-kroppen
            ✗ "\\\\placeholder[f]x^{2}"   ← saknar {} efter [f]
  prompts : [{ "id": "x1", "answer": "2" }]  — samma id:n; answer = bare LaTeX
  content, label, problemLatex, caption : ""
  display : "inline"
  steps, choices : []

type=solution  — guidad flerstegslösning (varje steg = lucka)
  problemLatex : ENBART matematik för startuttrycket (utan $). ALDRIG \\\\text{…}.
                 Svenska runt uppgiften → egna text/latex-parts FÖRE solution.
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
  hint : text/latex-array (samma split-regler). Tom [] om ingen ledtråd.
  Minst ett steg. Varje steg: minst en \\\\placeholder[id]{} + matchande prompt.
  Ge INTE facit i title/hint.
  content, label, prompt, latex, caption : ""   ← solution.latex MÅSTE vara ""
  display : "inline"
  prompts, choices : []   (prompts ligger INUTI steps)

type=quickReplies  — klickbara snabbval
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
LUCKOR — SUBSTITUTION MÅSTE STÄMMA
════════════════════════════════════════
fillBlank = en ruta. solution = flera steg med en lucka-ruta per steg.

1. Placeholder med TOM kropp: \\\\placeholder[id]{}  — {} är OBLIGATORISK direkt efter ].
   ✓ "\\\\frac{\\\\placeholder[b]{}}{\\\\placeholder[c]{}}"
   ✗ "\\\\frac{\\\\placeholder[b]}{\\\\placeholder[c]}"
   ✗ "\\\\placeholder[f]x^{2}"  → skriv "\\\\placeholder[f]{} x^{2}"
2. Om varje \\\\placeholder[id]{} ersätts med prompts[].answer MÅSTE resultatet = solvedLatex.
   Därför: en term per lucka när tecken spelar roll. Efter minus: INTE en lucka "b+1".
   ✓ latex "a^{2}+\\\\placeholder[m]{}-\\\\placeholder[n]{}-\\\\placeholder[p]{}"
       answers m=a, n=b, p=1  →  "a^{2}+a-b-1"
   ✗ latex "a^{2}+\\\\placeholder[m]{}-\\\\placeholder[n]{}"  n="b+1"
       → "a^{2}+a-b+1" ≠ "a^{2}+a-b-1"
   ✓ latex "y=5x-\\\\placeholder[c]{}-\\\\placeholder[d]{}"  c=5, d=x^{2}
   ✗ latex "y=5x-\\\\placeholder[c]{}"  c="5+x^{2}"  → "y=5x-5+x^{2}" FEL
3. Rätt svar BARA i prompts[].answer (bare LaTeX). Aldrig i placeholder-kroppen.
4. Varje id i latex ↔ exakt en prompt.
5. Visa ALDRIG facit i text/hint/title samtidigt som luckan.
6. Undvik \\\\div inuti \\\\frac — använd snedstreck: "\\\\frac{12/4}{104/4}".

NÄR (chattläget styr — följ strikt):
  • Ledtråd utan facit           → text (+ ev. quickReplies)
  • En slutlig svarsruta         → fillBlank
  • Guidad lösning steg för steg → solution
  • Ja/nej / välj väg            → quickReplies

════════════════════════════════════════
CHATTLÄGEN  (ges separat som "Chattläge (format): …" — FÖLJ EXAKT)
════════════════════════════════════════

normal
  • Sokratisk hjälp med text + latex från den arbetade lösningen.
  • fillBlank / solution BARA om studenten ber om luckor eller övning.
  • quickReplies OK för korta vägval.
  • Ge inte hela facit om studenten bara frågar "hur börjar jag?".

fillBlank
  • HUVUDSAK: solution med 2–5 steg (luckor i varje steg), ELLER fillBlank om kort.
  • Kort text-hint OK — FÖRBJUDET att skriva facit i text/title/hint.
  • Facit endast i prompts[].answer / solvedLatex (kopierat från arbetad lösning).

thoughtProcess
  • Fokus: hur man TÄNKER. text + latex (notes från lösningen OK — som text-parts).
  • Gärna solution eller fillBlank på kritiska mellansteg.
  • Förklara VARFÖR, inte bara vad.

answerBoxes
  • BARA slutliga fillBlank-svarsrutor (en per deluppgift om (a)/(b) finns).
  • Högst 1–2 korta text-meningar som intro.
  • FÖRBJUDET: type=solution, långa genomgångar, facit i text.
  • Facit endast i prompts[].answer.

════════════════════════════════════════
PEDAGOGIK (format — inte omräkning)
════════════════════════════════════════
• Var sokratisk i text: led, fråga — dumpa inte facit i normal/fillBlank-prosa.
• Om läget förbjuder facit i text: håll prompts[].answer / solvedLatex korrekta internt.
• subproblem när den arbetade lösningen har labels a/b/c; annars undvik onödiga markörer.

════════════════════════════════════════
EXEMPEL  (✓ = bra, ✗ = dåligt)
════════════════════════════════════════

Ex 1 — text/latex-split:
  ✓ text "Förenkla", latex "a^{2}+b-c", text "där", latex "c=1-a+2b"
  ✗ text "Förenkla a^{2}+b-c där c=1"
  ✗ latex "\\\\text{Förenkla }a^{2}+b-c"
  ✗ problemLatex "a^{2}+b-c \\\\text{ där } c=1-a+2b"

Ex 2 — fillBlank:
  ✓ type=fillBlank, prompt="Lös för x",
      latex="x=\\\\placeholder[x1]{}", prompts=[{id:"x1", answer:"5"}]
  ✗ latex="x=\\\\placeholder[x1]{5}"
  ✗ text "Svaret är x=5" + fillBlank

Ex 3 — solution (fillBlank-läge) med ren problemLatex + hint-split:
  ✓ text "Förenkla", latex "a^{2}+b-c", text "där", latex "c=1-a+2b",
     subproblem a,
     type=solution,
      problemLatex="a^{2}+b-c",
      steps=[
        { id:"s1", title:"Substituera c",
          hint:[{type:"text", content:"Sätt in uttrycket för", display:"inline"},
                {type:"latex", content:"c", display:"inline"}],
          latex="a^{2}+b-(\\\\placeholder[c]{})",
          prompts:[{id:"c", answer:"1-a+2b"}],
          solvedLatex:"a^{2}+b-(1-a+2b)" },
        { id:"s2", title:"Expandera minus",
          hint:[{type:"text", content:"Byt tecken i varje term.", display:"inline"}],
          latex="a^{2}+b-\\\\placeholder[p]{}+\\\\placeholder[q]{}-\\\\placeholder[r]{}",
          prompts:[{id:"p", answer:"1"},{id:"q", answer:"a"},{id:"r", answer:"2b"}],
          solvedLatex:"a^{2}+b-1+a-2b" },
        { id:"s3", title:"Förenkla",
          hint:[],
          latex="a^{2}+\\\\placeholder[m]{}-\\\\placeholder[n]{}-\\\\placeholder[o]{}",
          prompts:[{id:"m", answer:"a"},{id:"n", answer:"b"},{id:"o", answer:"1"}],
          solvedLatex:"a^{2}+a-b-1" }
      ]
  ✗ problemLatex med \\\\text{där}
  ✗ solution.latex ifylld (ska vara "")
  ✗ en lucka "b+1" efter minus som inte ger solvedLatex vid strängersättning
  ✗ hint som en sträng med \\\\frac

Ex 4 — answerBoxes:
  ✓ text "Fyll i svaren.",
     subproblem a, fillBlank latex="\\\\placeholder[a1]{}" prompts=[{id:"a1", answer:"2x"}],
     subproblem b, fillBlank latex="\\\\placeholder[b1]{}" prompts=[{id:"b1", answer:"x-1"}]
  ✗ type=solution i answerBoxes-läge

Ex 5 — normal:
  ✓ text "Börja med att samla x-termer:", latex "3x-x=2x", text "Vad blir nästa steg?",
     quickReplies choices=[{id:"t1", label:"Visa ett tips"}, {id:"t2", label:"Visa en lucka"}]
  ✗ tvinga solution när studenten bara ställde en kort fråga

Ex 6 — placeholder {} obligatorisk:
  ✓ "\\\\placeholder[f]{} x^{2}"
  ✗ "\\\\placeholder[f]x^{2}"

Ex 7 — thoughtProcess:
  ✓ text "Tanken är att få x ensamt. Vi har", latex "2x+3=11",
     text "Konstanten stör — flytta den först.",
     fillBlank prompt="Vad blir högerledet?", latex="2x=\\\\placeholder[r]{}",
       prompts=[{id:"r", answer:"8"}]
`;

/**
 * Pass 2 mode hint — presentation only (injected every turn from current thread mode).
 */
export function formatModeHint(mode: ChatMode): string {
  switch (mode) {
    case "normal":
      return `Chattläge (format): normal
• text + latex (sokratiskt) från den arbetade lösningen. quickReplies OK.
• INGEN latex i text, INGEN text/\\\\text i latex — splitta.
• fillBlank/solution BARA om studenten ber om luckor/övning.
• Dumpa inte hela facit på en öppen fråga.`;
    case "fillBlank":
      return `Chattläge (format): fillBlank
• MÅSTE använda solution (2–5 steg med luckor) eller fillBlank.
• problemLatex = ren matematik; svenska runt → egna text/latex-parts.
• Placeholder-ersättning MÅSTE ge solvedLatex. Kort hint OK — inget facit i text.
• Facit endast i prompts[].answer / solvedLatex (kopierat från arbetad lösning).`;
    case "thoughtProcess":
      return `Chattläge (format): thoughtProcess
• Förklara HUR man tänker (text + latex) utifrån den arbetade lösningen.
• Splitta text/latex strikt. Lägg fillBlank/solution på kritiska mellansteg.
• Resonemang först — inte bara svarsrutor.`;
    case "answerBoxes":
      return `Chattläge (format): answerBoxes
• BARA fillBlank-svarsrutor (en per deluppgift om (a)/(b)).
• Max 1–2 korta textmeningar som intro (ingen TeX i text).
• FÖRBJUDET: type=solution, lång genomgång, facit i text.`;
  }
}
