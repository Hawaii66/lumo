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
});

export const latexPartSchema = z.object({
  type: z.literal("latex"),
  content: z.string(),
  display: z.enum(["inline", "block"]).optional(),
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

export const lumoPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  latexPartSchema,
  fillBlankPartSchema,
  solutionPartSchema,
  quickRepliesPartSchema,
  subproblemPartSchema,
]);

/** Zod schema for agent.generateObject — Lumo content envelope. */
export const lumoDocumentSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoPartSchema).min(1),
});

export type LumoDocument = z.infer<typeof lumoDocumentSchema>;
export type PromptSpec = z.infer<typeof promptSpecSchema>;

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
- { "type": "text", "content": "..." } — vanlig förklaring
- { "type": "latex", "content": "...", "display"?: "inline"|"block" } — statisk matematik (BARA LaTeX, utan $ eller $$)
- { "type": "fillBlank", "prompt"?: "...", "latex": "...", "prompts": [{ "id": "...", "answer": "..." }] }
- { "type": "solution", "problemLatex": "...", "steps": [{ "id", "title", "hint", "latex", "prompts": [{ "id", "answer" }], "solvedLatex" }] }
- { "type": "quickReplies", "choices": [{ "id", "label" }] } — klickbara snabbval
- { "type": "subproblem", "label": "a" } — deluppgiftsetikett

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
