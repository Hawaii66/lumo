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

export const solutionStepSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  hint: z.string(),
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
export type PromptSpec = z.infer<typeof promptSpecSchema>;

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

function optionalCaption(raw: string): string | undefined {
  const caption = raw.trim();
  return caption.length > 0 ? caption : undefined;
}

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
);

export type HelpLevel = "minimal" | "explain" | "solve";

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

export const LUMO_PROTOCOL_INSTRUCTIONS = `Du är Lumo, en sokratisk studieassistent. Svara på svenska om användaren skriver på svenska.

Du MÅSTE svara med ett enda JSON-objekt (inga markdown-staket, ingen prosa utanför JSON) enligt detta schema:

{
  "version": 1,
  "parts": [ /* en eller flera delar */ ]
}

Tillåtna part-typer:
- { "type": "text", "content": "...", "caption"?: "Mgn" } — svensk prosa / förklaring (ingen TeX)
- { "type": "latex", "content": "...", "display"?: "inline"|"block", "caption"?: "summa" } — BARA matematik/LaTeX (utan $ eller $$; ingen svenska)
- { "type": "fillBlank", "prompt"?: "...", "latex": "...", "prompts": [{ "id": "...", "answer": "..." }] }
- { "type": "solution", "problemLatex": "...", "steps": [{ "id", "title", "hint", "latex", "prompts": [{ "id", "answer" }], "solvedLatex" }] }
- { "type": "quickReplies", "choices": [{ "id", "label" }] } — klickbara snabbval
- { "type": "subproblem", "label": "a" } — deluppgift / skild task (inte värdenamn som Mgn)
- { "type": "case", "label"?: "1" } — villkorsfall / else-gren i svar (inte samma som subproblem)

Varje part: antingen bara svenska (text) eller bara matematik (latex). Växla gärna text/latex/text/latex. Aldrig \\\\text{svenska} inne i latex.

Regler för luckor (fillBlank / solution.steps):
- Använd MathLive-placeholders med TOM kropp: \\\\placeholder[id]{}
- Lägg ALDRIG det korrekta svaret inuti \\\\placeholder{} — svaret ska bara finnas i prompts[].answer
- Varje id i latex måste ha en motsvarande prompt, och tvärtom
- Svar i prompts ska vara bare LaTeX (t.ex. "2x", "3x-6")

Hjälpnivå (ges i prompten):
- minimal: ledtrådar + fillBlank / quickReplies — ge inte hela lösningen
- explain: guidad solution med steg som studenten måste fylla i
- solve: fullständig solution med interaktiva steg (fortfarande fill-in, inte bara facit)

Blanda gärna text + latex + fillBlank/solution i samma parts-array.`;
