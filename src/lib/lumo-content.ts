import { z } from "zod"

/** Matches empty MathLive placeholders: `\placeholder[id]{}` */
const PLACEHOLDER_ID_RE = /\\placeholder\[([^\]]+)\]\{\}/g

export const promptSpecSchema = z.object({
  id: z.string().min(1),
  answer: z.string().min(1),
})

export const textPartSchema = z.object({
  type: z.literal("text"),
  content: z.string(),
})

export const latexPartSchema = z.object({
  type: z.literal("latex"),
  content: z.string(),
  display: z.enum(["inline", "block"]).optional(),
})

export const fillBlankPartSchema = z.object({
  type: z.literal("fillBlank"),
  prompt: z.string().optional(),
  latex: z.string(),
  prompts: z.array(promptSpecSchema).min(1),
})

export const solutionStepSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  hint: z.string(),
  latex: z.string(),
  prompts: z.array(promptSpecSchema).min(1),
  solvedLatex: z.string(),
})

export const solutionPartSchema = z.object({
  type: z.literal("solution"),
  problemLatex: z.string(),
  steps: z.array(solutionStepSchema).min(1),
})

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
})

export const subproblemPartSchema = z.object({
  type: z.literal("subproblem"),
  label: z.string().min(1),
})

export const lumoPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  latexPartSchema,
  fillBlankPartSchema,
  solutionPartSchema,
  quickRepliesPartSchema,
  subproblemPartSchema,
])

export const lumoDocumentSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoPartSchema).min(1),
})

export type PromptSpec = z.infer<typeof promptSpecSchema>
export type LumoPart = z.infer<typeof lumoPartSchema>
export type LumoDocument = z.infer<typeof lumoDocumentSchema>
export type FillBlankPart = z.infer<typeof fillBlankPartSchema>
export type SolutionPart = z.infer<typeof solutionPartSchema>
export type SolutionStep = z.infer<typeof solutionStepSchema>
export type QuickRepliesPart = z.infer<typeof quickRepliesPartSchema>

export function extractPlaceholderIds(latex: string): Array<string> {
  const ids: Array<string> = []
  for (const match of latex.matchAll(PLACEHOLDER_ID_RE)) {
    const id = match[1]
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Ensures every `\placeholder[id]{}` has a matching prompts entry and vice versa.
 * Returns a human-readable error, or null if OK.
 */
export function assertPlaceholdersMatchPrompts(
  latex: string,
  prompts: Array<PromptSpec>,
): string | null {
  const ids = extractPlaceholderIds(latex)
  const promptIds = prompts.map((p) => p.id)

  for (const id of ids) {
    if (!promptIds.includes(id)) {
      return `Placeholder "${id}" saknar svar i prompts`
    }
  }
  for (const id of promptIds) {
    if (!ids.includes(id)) {
      return `Prompt "${id}" saknar \\placeholder[${id}]{} i latex`
    }
  }
  return null
}

export function validateLumoDocument(doc: LumoDocument): string | null {
  for (const part of doc.parts) {
    if (part.type === "fillBlank") {
      const err = assertPlaceholdersMatchPrompts(part.latex, part.prompts)
      if (err) return err
    }
    if (part.type === "solution") {
      for (const step of part.steps) {
        const err = assertPlaceholdersMatchPrompts(step.latex, step.prompts)
        if (err) return `Steg ${step.id}: ${err}`
      }
    }
  }
  return null
}

export function stringifyLumoDocument(doc: LumoDocument): string {
  return JSON.stringify(doc)
}

/**
 * Parse assistant message text as a LumoDocument.
 * Invalid / legacy plain text falls back to a single text part.
 */
export function parseLumoDocument(input: string): LumoDocument {
  const trimmed = input.trim()
  if (!trimmed.startsWith("{")) {
    return { version: 1, parts: [{ type: "text", content: input }] }
  }

  try {
    const json: unknown = JSON.parse(trimmed)
    const result = lumoDocumentSchema.safeParse(json)
    if (result.success) {
      return result.data
    }
  } catch {
    // fall through
  }

  return { version: 1, parts: [{ type: "text", content: input }] }
}

export function textDocument(content: string): LumoDocument {
  return { version: 1, parts: [{ type: "text", content }] }
}
