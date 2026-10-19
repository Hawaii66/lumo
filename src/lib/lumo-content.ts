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
  /** Optional name for this value within a task, e.g. "Mgn", "summa". */
  caption: z.string().min(1).optional(),
})

export const latexPartSchema = z.object({
  type: z.literal("latex"),
  content: z.string(),
  display: z.enum(["inline", "block"]).optional(),
  /** Optional name for this value within a task, e.g. "Mgn", "summa". */
  caption: z.string().min(1).optional(),
})

export const fillBlankPartSchema = z.object({
  type: z.literal("fillBlank"),
  prompt: z.string().optional(),
  latex: z.string(),
  prompts: z.array(promptSpecSchema).min(1),
})

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
])

export const solutionStepSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  hint: z.array(hintPartSchema),
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

/** Answer-case / branch marker (not a task letter). */
export const casePartSchema = z.object({
  type: z.literal("case"),
  label: z.string().optional(),
})

export const lumoPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  latexPartSchema,
  fillBlankPartSchema,
  solutionPartSchema,
  quickRepliesPartSchema,
  subproblemPartSchema,
  casePartSchema,
])

export const lumoDocumentSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoPartSchema).min(1),
})

/** Static textbook content from PDF parsing: text + latex + subproblem/case. */
export const lumoStaticPartSchema = z.discriminatedUnion("type", [
  textPartSchema,
  latexPartSchema,
  subproblemPartSchema,
  casePartSchema,
])

export const lumoStaticDocumentSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoStaticPartSchema).min(1),
})

export const lumoStaticAnswerDocumentSchema = z.object({
  version: z.literal(1),
  parts: z.array(lumoStaticPartSchema),
})

export const lumoParsedProblemSchema = z.object({
  problemNumber: z.string().min(1),
  question: lumoStaticDocumentSchema,
  answer: lumoStaticAnswerDocumentSchema,
})

export type PromptSpec = z.infer<typeof promptSpecSchema>
export type HintPart = z.infer<typeof hintPartSchema>
export type LumoPart = z.infer<typeof lumoPartSchema>
export type LumoDocument = z.infer<typeof lumoDocumentSchema>
export type FillBlankPart = z.infer<typeof fillBlankPartSchema>
export type SolutionPart = z.infer<typeof solutionPartSchema>
export type SolutionStep = z.infer<typeof solutionStepSchema>
export type QuickRepliesPart = z.infer<typeof quickRepliesPartSchema>
export type LumoStaticPart = z.infer<typeof lumoStaticPartSchema>
export type LumoStaticDocument = z.infer<typeof lumoStaticDocumentSchema>
export type LumoParsedProblem = z.infer<typeof lumoParsedProblemSchema>

/**
 * MathLive requires `\placeholder[id]{}` (empty body group).
 * Models often emit `\placeholder[id]` which parses as doubled empty
 * boxes / stray squares inside fractions.
 */
export function repairPlaceholderLatex(latex: string): string {
  return latex.replace(
    /\\placeholder\[([^\]]*)\](?!\s*\{)/g,
    "\\placeholder[$1]{}",
  )
}

export function extractPlaceholderIds(latex: string): Array<string> {
  const ids: Array<string> = []
  for (const match of repairPlaceholderLatex(latex).matchAll(
    PLACEHOLDER_ID_RE,
  )) {
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

function optionalCaption(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined
  const caption = raw.trim()
  return caption.length > 0 ? caption : undefined
}

function asPromptSpecs(raw: unknown): Array<PromptSpec> {
  if (!Array.isArray(raw)) return []
  const out: Array<PromptSpec> = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const id = "id" in item && typeof item.id === "string" ? item.id.trim() : ""
    const answer =
      "answer" in item && typeof item.answer === "string"
        ? item.answer.trim()
        : ""
    if (id.length === 0 || answer.length === 0) continue
    out.push({ id, answer })
  }
  return out
}

/** Accept new text/latex hint arrays; also tolerate legacy plain-string hints. */
function asHintParts(raw: unknown): Array<HintPart> {
  if (typeof raw === "string") {
    const content = raw.trim()
    return content.length > 0 ? [{ type: "text", content }] : []
  }
  if (!Array.isArray(raw)) return []
  const out: Array<HintPart> = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const type =
      "type" in item && (item.type === "text" || item.type === "latex")
        ? item.type
        : null
    const content =
      "content" in item && typeof item.content === "string"
        ? item.content.trim()
        : ""
    if (type === null || content.length === 0) continue
    if (type === "text") {
      out.push({ type: "text", content })
    } else {
      const display =
        "display" in item && item.display === "block" ? "block" : "inline"
      out.push({ type: "latex", content, display })
    }
  }
  return out
}

/** Normalize flat OpenAI structured-output parts (all fields present). */
function normalizeFlatPart(part: Record<string, unknown>): LumoPart | null {
  const type = part.type
  switch (type) {
    case "text": {
      const content = typeof part.content === "string" ? part.content.trim() : ""
      if (content.length === 0) return null
      const caption = optionalCaption(part.caption)
      return caption !== undefined
        ? { type: "text", content, caption }
        : { type: "text", content }
    }
    case "latex": {
      const content = typeof part.content === "string" ? part.content.trim() : ""
      if (content.length === 0) return null
      const display = part.display === "block" ? "block" : "inline"
      const caption = optionalCaption(part.caption)
      return caption !== undefined
        ? { type: "latex", content, display, caption }
        : { type: "latex", content, display }
    }
    case "fillBlank": {
      const latex = repairPlaceholderLatex(
        typeof part.latex === "string" ? part.latex.trim() : "",
      )
      const prompts = asPromptSpecs(part.prompts)
      if (latex.length === 0 || prompts.length === 0) return null
      const prompt =
        typeof part.prompt === "string" ? part.prompt.trim() : ""
      return prompt.length > 0
        ? { type: "fillBlank", prompt, latex, prompts }
        : { type: "fillBlank", latex, prompts }
    }
    case "solution": {
      if (!Array.isArray(part.steps)) return null
      const steps: SolutionStep[] = []
      for (const step of part.steps) {
        if (typeof step !== "object" || step === null) continue
        const id =
          "id" in step && typeof step.id === "string" ? step.id.trim() : ""
        const latex = repairPlaceholderLatex(
          "latex" in step && typeof step.latex === "string"
            ? step.latex.trim()
            : "",
        )
        const prompts = asPromptSpecs(
          "prompts" in step ? step.prompts : undefined,
        )
        if (id.length === 0 || latex.length === 0 || prompts.length === 0) {
          continue
        }
        steps.push({
          id,
          title:
            "title" in step && typeof step.title === "string"
              ? step.title.trim()
              : "",
          hint: asHintParts("hint" in step ? step.hint : undefined),
          latex,
          prompts,
          solvedLatex:
            "solvedLatex" in step && typeof step.solvedLatex === "string"
              ? step.solvedLatex.trim()
              : "",
        })
      }
      if (steps.length === 0) return null
      return {
        type: "solution",
        problemLatex:
          typeof part.problemLatex === "string" ? part.problemLatex.trim() : "",
        steps,
      }
    }
    case "quickReplies": {
      if (!Array.isArray(part.choices)) return null
      const choices: Array<{ id: string; label: string }> = []
      for (const choice of part.choices) {
        if (typeof choice !== "object" || choice === null) continue
        const id =
          "id" in choice && typeof choice.id === "string"
            ? choice.id.trim()
            : ""
        const label =
          "label" in choice && typeof choice.label === "string"
            ? choice.label.trim()
            : ""
        if (id.length === 0 || label.length === 0) continue
        choices.push({ id, label })
      }
      if (choices.length === 0) return null
      return { type: "quickReplies", choices }
    }
    case "subproblem": {
      const label =
        typeof part.label === "string" ? part.label.trim().toLowerCase() : ""
      if (label.length === 0) return null
      return { type: "subproblem", label }
    }
    case "case": {
      const label = typeof part.label === "string" ? part.label.trim() : ""
      return label.length > 0 ? { type: "case", label } : { type: "case" }
    }
    default:
      return null
  }
}

function documentFromUnknown(json: unknown): LumoDocument | null {
  const strict = lumoDocumentSchema.safeParse(json)
  if (strict.success) return strict.data

  if (typeof json !== "object" || json === null || !("parts" in json)) {
    return null
  }
  if (!Array.isArray(json.parts)) return null

  const parts: Array<LumoPart> = []
  for (const part of json.parts) {
    if (typeof part !== "object" || part === null) continue
    const normalized = normalizeFlatPart(part as Record<string, unknown>)
    if (normalized !== null) parts.push(normalized)
  }
  if (parts.length === 0) return null
  return { version: 1, parts }
}

/**
 * Close open strings/brackets and strip trailing commas / incomplete keys so
 * partial streamed JSON can be previewed without oscillating to empty.
 */
function repairPartialJson(text: string): string {
  let body = text
  let inString = false
  let escape = false
  for (const ch of body) {
    if (inString) {
      if (escape) escape = false
      else if (ch === "\\") escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
  }
  if (inString) body += '"'

  // Stream gaps often end mid-property: `...,` / `...,"key"` / `...,"key":`
  for (;;) {
    const next = body
      .replace(/,\s*$/, "")
      .replace(/:\s*$/, "")
      .replace(/,\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*$/, "")
      .replace(/\{\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*$/, "{")
    if (next === body) break
    body = next
  }

  const stack: Array<string> = []
  inString = false
  escape = false
  for (const ch of body) {
    if (inString) {
      if (escape) escape = false
      else if (ch === "\\") escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === "{") stack.push("}")
    else if (ch === "[") stack.push("]")
    else if (ch === "}" || ch === "]") stack.pop()
  }
  if (inString) body += '"'
  while (stack.length > 0) {
    body += stack.pop()
  }
  return body
}

/** Close open strings/brackets so partial streamed JSON can be previewed. */
function tryParsePartialJson(text: string): unknown | undefined {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    // continue
  }

  let slice = trimmed
  while (slice.length > 0) {
    try {
      return JSON.parse(repairPartialJson(slice))
    } catch {
      const comma = slice.lastIndexOf(",")
      const colon = slice.lastIndexOf(":")
      const cut = Math.max(comma, colon)
      if (cut > 0) {
        slice = slice.slice(0, cut)
        continue
      }
      const closed = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"))
      if (closed > 0) {
        slice = slice.slice(0, closed + 1)
        continue
      }
      return undefined
    }
  }
  return undefined
}

/**
 * Parse assistant message text as a LumoDocument.
 * Supports strict Lumo JSON, flat OpenAI structured-output JSON, and
 * partial JSON while a stream is in progress.
 */
export function parseLumoDocument(
  input: string,
  options?: { streaming?: boolean },
): LumoDocument {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return { version: 1, parts: [{ type: "text", content: "" }] }
  }
  if (!trimmed.startsWith("{")) {
    return { version: 1, parts: [{ type: "text", content: input }] }
  }

  try {
    const json: unknown = JSON.parse(trimmed)
    const doc = documentFromUnknown(json)
    if (doc !== null) return doc
  } catch {
    // fall through to partial parse
  }

  if (options?.streaming) {
    const partial = tryParsePartialJson(trimmed)
    const doc = partial !== undefined ? documentFromUnknown(partial) : null
    if (doc !== null) return doc
    // Don't dump raw JSON mid-stream — show a quiet placeholder.
    return { version: 1, parts: [{ type: "text", content: "" }] }
  }

  return { version: 1, parts: [{ type: "text", content: input }] }
}

export function textDocument(content: string): LumoDocument {
  return { version: 1, parts: [{ type: "text", content }] }
}

function tryParsePasteJson(trimmed: string): unknown | undefined {
  try {
    return JSON.parse(trimmed)
  } catch {
    // Allow a comma-separated list of objects without outer brackets.
  }

  try {
    return JSON.parse(`[${trimmed.replace(/,\s*$/, "")}]`)
  } catch {
    // Fall through to JS-literal attempt below.
  }

  // Tolerate unquoted keys from console / TS pastes (local preview only).
  try {
    const candidate = /^[\[{]/.test(trimmed)
      ? trimmed
      : `[${trimmed.replace(/,\s*$/, "")}]`
    // Local preview only: evaluate object/array literals with unquoted keys.
    return new Function(`"use strict"; return (${candidate})`)()
  } catch {
    return undefined
  }
}

/**
 * Parse pasted PDF-parse output: one problem, an array of problems,
 * or a bare static document (treated as question-only).
 */
export function parseLumoParsedProblems(input: string): {
  problems: Array<LumoParsedProblem>
  error: string | null
} {
  const trimmed = input.trim()
  if (!trimmed) {
    return { problems: [], error: null }
  }

  const json = tryParsePasteJson(trimmed)
  if (json === undefined) {
    return {
      problems: [],
      error: "Ogiltig JSON — klistra in ett problem-objekt eller en array.",
    }
  }

  const asArray = Array.isArray(json) ? json : [json]
  const problems: Array<LumoParsedProblem> = []

  for (let i = 0; i < asArray.length; i++) {
    const item = asArray[i]
    const problemResult = lumoParsedProblemSchema.safeParse(item)
    if (problemResult.success) {
      problems.push(problemResult.data)
      continue
    }

    const docResult = lumoStaticDocumentSchema.safeParse(item)
    if (docResult.success) {
      problems.push({
        problemNumber: String(i + 1),
        question: docResult.data,
        answer: { version: 1, parts: [] },
      })
      continue
    }

    return {
      problems: [],
      error: `Objekt ${i + 1}: förväntade problemNumber/question/answer (text|latex|subproblem|case; valfri caption).`,
    }
  }

  return { problems, error: null }
}
