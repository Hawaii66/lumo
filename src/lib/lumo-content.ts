import { z } from "zod"

/** One textbook problem: markdown question + answer. */
export const lumoParsedProblemSchema = z.object({
  problemNumber: z.string().min(1),
  question: z.string(),
  answer: z.string(),
})

export type LumoParsedProblem = z.infer<typeof lumoParsedProblemSchema>

function tryParsePasteJson(trimmed: string): unknown | undefined {
  try {
    return JSON.parse(trimmed)
  } catch {
    // Allow a comma-separated list of objects without outer brackets.
  }

  try {
    return JSON.parse(`[${trimmed.replace(/,\s*$/, "")}]`)
  } catch {
    // Fall through
  }

  try {
    const candidate = /^[\[{]/.test(trimmed)
      ? trimmed
      : `[${trimmed.replace(/,\s*$/, "")}]`
    return new Function(`"use strict"; return (${candidate})`)()
  } catch {
    return undefined
  }
}

/**
 * Parse pasted PDF-parse output: one problem or an array of problems.
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

    return {
      problems: [],
      error: `Objekt ${i + 1}: förväntade problemNumber, question (markdown), answer (markdown).`,
    }
  }

  return { problems, error: null }
}

// Re-export chat reply helpers for convenience.
export {
  parseChatReply,
  chatReplyHasVisibleContent,
  chatReplySchema,
  type ChatReply,
  type ChatQuickReplyChoice,
} from "./chat-reply"

export {
  chaptersFromMarkdown,
  subproblemAnchorId,
  type ChapterHeading,
} from "./markdown-math"
