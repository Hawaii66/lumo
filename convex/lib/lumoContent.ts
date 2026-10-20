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
  label: z.string().describe("Button label; empty when unused"),
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
/**
 * Pass 1 mode hint — solution depth only (injected every turn from current thread mode).
 */
export function solveModeHint(mode: ChatMode): string {
  switch (mode) {
    case "normal":
      return `Chattläge (lösning): normal
• Ge finalLatex + de nyckelmellansteg som behövs för att hjälpa studenten.
• Hoppa mikroalgebra om kedjan fortfarande är tydlig och korrekt.`;
    case "genomgang":
      return `Chattläge (lösning): genomgang
• Ge 2–5 mellansteg + korta note som förklarar VARFÖR steget gäller.
• Matten i latex måste vara korrekt; note ersätter aldrig uttrycket.`;
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
• Kopiera uttryck från den arbetade lösningen. OMRÄKNA INTE tecken, parenteser eller termer.
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

  type, content, display, caption, label, choices

display: "inline" eller "block" (använd "inline" när typen inte är latex).
choices: tom [] när oanvända.

════════════════════════════════════════
TEXT vs LATEX — DELA ALLTID UPP
════════════════════════════════════════
INGEN latex i text. INGEN text i latex. Splitta: text / latex / text / latex / …

type=text  → enbart naturlig svenska/engelska — INGA backslash (\\\\).
  ✓ "Förenkla", "där", "Nästa steg:", "Ja", "Nej"
  ✗ \\\\frac, \\\\sqrt, \\\\text, ^{}, _{}
  HARD: om content innehåller \\\\ → det FÅR INTE vara type=text. Flytta till latex.

type=latex  → enbart LaTeX-matematik (utan $ eller $$).
  ✓ "a^{2}+b-c", "\\\\frac{1}{2}", "x\\\\neq 0"
  ✗ svenska ord; \\\\text{där}; \\\\mathrm{Nej}
  RÄTT: text "Vi får", latex "x=\\\\frac{3}{4}", text "när", latex "t=2"
  FEL:  text "Vi får x=\\\\frac{3}{4} när t=2"

• Tappa ALDRIG vänsterledet: "a < 81/4" → latex "a<\\\\frac{81}{4}"
• Indexerade symboler (P_{1}, α_{1}) → alltid type=latex.

════════════════════════════════════════
PART-TYPER
════════════════════════════════════════

type=text
  content : svensk/engelsk prosa
  display : "inline"
  label : ""
  caption : valfritt värdenamn ("Mgn", "summa"); "" annars
  choices : []

type=latex
  content : matematik
  display : "inline" | "block"
  label : ""
  caption : valfritt värdenamn; "" annars
  choices : []

type=quickReplies  — klickbara snabbval (studenten styr nästa steg)
  choices : [{ "id": "opt1", "label": "Visa ett tips" }, …]  — minst ett, helst 2–4
  content, label, caption : ""
  display : "inline"
  • Labels = kompletta användarintentioner (inte bara "A"/"B").
  • Lägg quickReplies SIST i parts när du väntar på studentens val.
  • Ge INTE facit i en knapp-label.

type=subproblem  — markör för deluppgift (a)/(b)/(c)
  label   : "a" | "b" | "c" … — ALDRIG tom; ALDRIG värdenamn som "Mgn"
  content, caption : ""
  display : "inline"
  choices : []
  ⚠ MÅSTE följas av minst en text- eller latex-part.

type=case  — villkorsfall / "om …"-gren (INTE samma som subproblem)
  label   : "1", "2", … eller ""
  content, caption : ""
  display : "inline"
  choices : []
  ⚠ MÅSTE följas av innehållspart direkt efter.

════════════════════════════════════════
QUICK REPLIES — LED, LÅT STUDENTEN VÄLJA
════════════════════════════════════════
• Använd quickReplies ofta: du föreslår vägar, studenten väljer.
• Bra labels: "Visa ett tips", "Gå vidare", "Förklara varför", "Jag fastnade här", "Visa mer detalj".
• Undvik quiz-träd: förklara med text+latex först, erbjud sedan 2–4 nästa steg.
• Studenten kan alltid skriva fritt — knapparna är genvägar.

════════════════════════════════════════
CHATTLÄGEN  (ges separat som "Chattläge (format): …" — FÖLJ EXAKT)
════════════════════════════════════════

normal
  • Sokratisk hjälp med text + latex från den arbetade lösningen.
  • Avsluta ofta med quickReplies för nästa vägval.
  • Ge inte hela facit om studenten bara frågar "hur börjar jag?".

genomgang
  • Fokus: hur man TÄNKER. text + latex steg för steg (notes från lösningen → text-parts).
  • Förklara VARFÖR, inte bara vad. Markera deluppgifter med subproblem.
  • Avsluta stegblock med quickReplies ("Nästa steg", "Varför detta?", "Visa mer detalj").

════════════════════════════════════════
PEDAGOGIK (format — inte omräkning)
════════════════════════════════════════
• Var sokratisk i text: led, fråga — dumpa inte facit i prosa om läget inte kräver det.
• subproblem när den arbetade lösningen har labels a/b/c; annars undvik onödiga markörer.

════════════════════════════════════════
EXEMPEL  (✓ = bra, ✗ = dåligt)
════════════════════════════════════════

Ex 1 — text/latex-split:
  ✓ text "Förenkla", latex "a^{2}+b-c", text "där", latex "c=1-a+2b"
  ✗ text "Förenkla a^{2}+b-c där c=1"
  ✗ latex "\\\\text{Förenkla }a^{2}+b-c"

Ex 2 — normal med snabbval:
  ✓ text "Börja med att samla x-termer:", latex "3x-x=2x", text "Vad vill du göra nu?",
     quickReplies choices=[{id:"t1", label:"Visa ett tips"}, {id:"t2", label:"Gå vidare"}, {id:"t3", label:"Jag fastnade här"}]
  ✗ dumpa hela slutsvaren när studenten bara ställde en kort fråga

Ex 3 — genomgang:
  ✓ text "Tanken är att få x ensamt. Vi har", latex "2x+3=11",
     text "Konstanten stör — flytta den först till högerledet.",
     latex "2x=8",
     quickReplies choices=[{id:"n1", label:"Nästa steg"}, {id:"n2", label:"Varför detta?"}, {id:"n3", label:"Visa mer detalj"}]
`;

/**
 * Pass 2 mode hint — presentation only (injected every turn from current thread mode).
 */
export function formatModeHint(mode: ChatMode): string {
  switch (mode) {
    case "normal":
      return `Chattläge (format): normal
• text + latex (sokratiskt) från den arbetade lösningen.
• INGEN latex i text, INGEN text/\\\\text i latex — splitta.
• Avsluta ofta med quickReplies (2–4 vägval). Dumpa inte hela facit på en öppen fråga.`;
    case "genomgang":
      return `Chattläge (format): genomgang
• Förklara HUR man tänker (text + latex) utifrån den arbetade lösningen.
• Splitta text/latex strikt. Resonemang steg för steg; subproblem vid (a)/(b).
• Avsluta med quickReplies för nästa djup ("Nästa steg" / "Varför" / "Mer detalj").`;
  }
}
