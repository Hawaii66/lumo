import { z } from "zod"

export const chatQuickReplyChoiceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
})

export const chatReplySchema = z.object({
  version: z.literal(2),
  markdown: z.string(),
  quickReplies: z.array(chatQuickReplyChoiceSchema).max(4),
})

export type ChatReply = z.infer<typeof chatReplySchema>
export type ChatQuickReplyChoice = z.infer<typeof chatQuickReplyChoiceSchema>

function normalizeQuickReplies(
  raw: unknown,
): Array<{ id: string; label: string }> {
  if (!Array.isArray(raw)) return []
  const out: Array<{ id: string; label: string }> = []
  for (const choice of raw) {
    if (typeof choice !== "object" || choice === null) continue
    const id =
      "id" in choice && typeof choice.id === "string" ? choice.id.trim() : ""
    const label =
      "label" in choice && typeof choice.label === "string"
        ? choice.label.trim()
        : ""
    if (id.length === 0 || label.length === 0) continue
    out.push({ id, label })
    if (out.length >= 4) break
  }
  return out
}

function replyFromUnknown(json: unknown): ChatReply | null {
  const strict = chatReplySchema.safeParse(json)
  if (strict.success) return strict.data

  if (typeof json !== "object" || json === null) return null
  const record = json as Record<string, unknown>

  const markdown =
    typeof record.markdown === "string"
      ? record.markdown
      : typeof record.content === "string"
        ? record.content
        : null
  if (markdown === null) return null

  return {
    version: 2,
    markdown,
    quickReplies: normalizeQuickReplies(record.quickReplies),
  }
}

/**
 * Repair truncated JSON while streaming by truncating to the last
 * complete key/value boundary and closing open braces/brackets.
 */
function tryParsePartialJson(input: string): unknown | undefined {
  let slice = input.trim()
  if (!slice.startsWith("{")) return undefined

  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return JSON.parse(slice)
    } catch {
      const comma = slice.lastIndexOf(",")
      const colon = slice.lastIndexOf(":")
      const cut = Math.max(comma, colon)
      if (cut > 0) {
        slice = slice.slice(0, cut)
        let openBrace = 0
        let openBracket = 0
        let inString = false
        let escape = false
        for (const ch of slice) {
          if (escape) {
            escape = false
            continue
          }
          if (ch === "\\") {
            escape = true
            continue
          }
          if (ch === '"') {
            inString = !inString
            continue
          }
          if (inString) continue
          if (ch === "{") openBrace += 1
          else if (ch === "}") openBrace -= 1
          else if (ch === "[") openBracket += 1
          else if (ch === "]") openBracket -= 1
        }
        slice += "]".repeat(Math.max(0, openBracket))
        slice += "}".repeat(Math.max(0, openBrace))
        continue
      }
      return undefined
    }
  }
  return undefined
}

/**
 * Parse assistant message text as a ChatReply.
 * Plain non-JSON text becomes a markdown-only reply.
 */
export function parseChatReply(
  input: string,
  options?: { streaming?: boolean },
): ChatReply {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return { version: 2, markdown: "", quickReplies: [] }
  }
  if (!trimmed.startsWith("{")) {
    return { version: 2, markdown: input, quickReplies: [] }
  }

  try {
    const json: unknown = JSON.parse(trimmed)
    const reply = replyFromUnknown(json)
    if (reply !== null) return reply
  } catch {
    // fall through
  }

  if (options?.streaming) {
    const partial = tryParsePartialJson(trimmed)
    const reply = partial !== undefined ? replyFromUnknown(partial) : null
    if (reply !== null) return reply
    return { version: 2, markdown: "", quickReplies: [] }
  }

  return { version: 2, markdown: input, quickReplies: [] }
}

export function chatReplyHasVisibleContent(reply: ChatReply): boolean {
  return reply.markdown.trim().length > 0 || reply.quickReplies.length > 0
}
