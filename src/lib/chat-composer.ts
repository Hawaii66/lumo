/**
 * Problem mention after `@`: always `{number}-{fileSlug}`,
 * e.g. `1.2-tenta_2023-03`. Bare `@1.2` is still parsed for older messages.
 * Slugged form is tried first so `@1.2-tenta` is not split into bare `@1.2`.
 */
export const PROBLEM_MENTION_RE =
  /@((?:(\d+(?:\.\d+)*(?:·T\d+|[a-z])?)-(\S+))|(\d+(?:\.\d+)*(?:·T\d+|[a-z])?))/gi

/** Visible rows in the @ typeahead viewport (list scrolls beyond this). */
export const TYPEAHEAD_VISIBLE_COUNT = 8

const TYPEAHEAD_MAX_OPTIONS = 40

/** Slug used in `@3-slug` — strip `.pdf`, collapse whitespace to `_`. */
export function fileSlugFromName(fileName: string): string {
  return fileName
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, "_")
}

/** Full mention including `@`, always with PDF slug: `@3-tenta_2023-03`. */
export function formatProblemMention(
  problemNumber: string,
  fileName: string,
): string {
  return `@${formatProblemMentionToken(problemNumber, fileName)}`
}

/** Token without `@`, always `{number}-{fileSlug}`. */
export function formatProblemMentionToken(
  problemNumber: string,
  fileName: string,
): string {
  return `${problemNumber.trim()}-${fileSlugFromName(fileName)}`
}

export type ProblemMentionOption = {
  id: string
  problemNumber: string
  fileName: string
}

export type ActiveMention = {
  /** Full match including `@`, e.g. `@1.2` or `@1.2-tenta_2023-03` */
  raw: string
  /** Number part, e.g. `1.2` */
  number: string
  /** PDF slug after `-` when present, e.g. `tenta_2023-03` */
  fileSlug?: string
  start: number
  end: number
}

export type ResolvedDraftMention =
  | {
      status: "resolved"
      problemId: string
      problemNumber: string
      fileName: string
    }
  | { status: "missing"; problemNumber: string; fileSlug?: string }
  | {
      status: "ambiguous"
      problemNumber: string
      fileSlug?: string
      options: Array<ProblemMentionOption>
    }

/** Dedup / display token without `@` for any resolved draft mention. */
export function mentionTokenKey(mention: ResolvedDraftMention): string {
  if (mention.status === "resolved") {
    return formatProblemMentionToken(mention.problemNumber, mention.fileName)
  }
  return mention.fileSlug
    ? `${mention.problemNumber}-${mention.fileSlug}`
    : mention.problemNumber
}

/** Every `@number` / `@number-slug` token in document order. */
export function findAllMentions(text: string): Array<ActiveMention> {
  const mentions: Array<ActiveMention> = []
  for (const match of text.matchAll(PROBLEM_MENTION_RE)) {
    const number = match[2] ?? match[4]
    const fileSlug = match[3]
    if (number === undefined || match.index === undefined) continue
    mentions.push({
      raw: match[0],
      number,
      ...(fileSlug !== undefined ? { fileSlug } : {}),
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return mentions
}

/** Resolve all @mentions; unique problem ids keep first-seen order. */
export function resolveDraftMentions(
  text: string,
  options: Array<ProblemMentionOption>,
): Array<ResolvedDraftMention> {
  const seenTokens = new Set<string>()
  const seenIds = new Set<string>()
  const resolved: Array<ResolvedDraftMention> = []

  for (const mention of findAllMentions(text)) {
    const key = mention.fileSlug
      ? `${mention.number.toLowerCase()}-${mention.fileSlug.toLowerCase()}`
      : mention.number.toLowerCase()
    if (seenTokens.has(key)) continue
    seenTokens.add(key)

    const matches = resolveMentionMatches(
      options,
      mention.number,
      mention.fileSlug,
    )
    if (matches.length === 0) {
      resolved.push({
        status: "missing",
        problemNumber: mention.number,
        ...(mention.fileSlug !== undefined
          ? { fileSlug: mention.fileSlug }
          : {}),
      })
      continue
    }
    if (matches.length > 1) {
      resolved.push({
        status: "ambiguous",
        problemNumber: mention.number,
        ...(mention.fileSlug !== undefined
          ? { fileSlug: mention.fileSlug }
          : {}),
        options: matches,
      })
      continue
    }
    const match = matches[0]!
    if (seenIds.has(match.id)) continue
    seenIds.add(match.id)
    resolved.push({
      status: "resolved",
      problemId: match.id,
      problemNumber: match.problemNumber,
      fileName: match.fileName,
    })
  }

  return resolved
}

/** Mention fragment at the cursor for typeahead (`@`, `@1.2`, `@1.2-ten`). */
export function findMentionQueryAtCursor(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = text.slice(0, cursor)
  const match = before.match(
    /@(\d*(?:\.\d*)*(?:·T\d*|[a-z])?(?:-[^\s]*)?)$/i,
  )
  if (!match || match.index === undefined) return null
  return { start: match.index, query: match[1] ?? "" }
}

export type SlashCommand = {
  id: string
  command: string
  label: string
  description: string
}

export const SLASH_COMMANDS: Array<SlashCommand> = [
  {
    id: "formel",
    command: "formel",
    label: "/formel",
    description: "Öppna formelredigeraren",
  },
  {
    id: "mode",
    command: "läge",
    label: "/läge",
    description: "Byt chattläge",
  },
]

/** Append freeform chat-box text after an auto-generated start prompt. */
export function appendUserTextToPrompt(
  autoPrompt: string,
  userText: string,
): string {
  const base = autoPrompt.trim()
  const extra = userText.trim()
  if (!extra) return base
  if (!base) return extra
  return `${base} ${extra}`
}

/** Slash command fragment at the cursor (`/`, `/f`, `/formel`). */
export function findSlashQueryAtCursor(
  text: string,
  cursor: number,
): { start: number; query: string } | null {
  const before = text.slice(0, cursor)
  const match = before.match(/(?:^|[\s])\/([a-zåäö]*)$/i)
  if (!match || match.index === undefined) return null
  // Point at `/`, not the leading whitespace.
  const slashIndex = before.lastIndexOf("/")
  if (slashIndex < 0) return null
  return { start: slashIndex, query: match[1] ?? "" }
}

export function filterSlashCommands(query: string): Array<SlashCommand> {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((cmd) => cmd.command.startsWith(normalized))
}

function compareProblemMentionOptions(
  a: ProblemMentionOption,
  b: ProblemMentionOption,
): number {
  const byFile = a.fileName.localeCompare(b.fileName, undefined, {
    numeric: true,
    sensitivity: "base",
  })
  if (byFile !== 0) return byFile
  return a.problemNumber.localeCompare(b.problemNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

export function filterProblemOptions(
  options: Array<ProblemMentionOption>,
  query: string,
): Array<ProblemMentionOption> {
  const normalized = query.trim().toLowerCase()
  const dash = normalized.indexOf("-")
  const numberQuery = dash >= 0 ? normalized.slice(0, dash) : normalized
  const slugQuery = dash >= 0 ? normalized.slice(dash + 1) : ""

  const filtered = normalized
    ? options.filter((option) => {
        const number = option.problemNumber.toLowerCase()
        const slug = fileSlugFromName(option.fileName).toLowerCase()
        if (dash >= 0) {
          const numberOk =
            numberQuery.length === 0 || number.startsWith(numberQuery)
          const slugOk = slugQuery.length === 0 || slug.startsWith(slugQuery)
          return numberOk && slugOk
        }
        return number.startsWith(numberQuery) || slug.startsWith(numberQuery)
      })
    : options

  return [...filtered]
    .sort(compareProblemMentionOptions)
    .slice(0, TYPEAHEAD_MAX_OPTIONS)
}

export function resolveMentionMatches(
  options: Array<ProblemMentionOption>,
  number: string,
  fileSlug?: string,
): Array<ProblemMentionOption> {
  const normalizedNumber = number.trim().toLowerCase()
  if (fileSlug === undefined || fileSlug.trim().length === 0) {
    return options.filter(
      (option) => option.problemNumber.toLowerCase() === normalizedNumber,
    )
  }
  const normalizedSlug = fileSlug.trim().toLowerCase()
  return options.filter(
    (option) =>
      option.problemNumber.toLowerCase() === normalizedNumber &&
      fileSlugFromName(option.fileName).toLowerCase() === normalizedSlug,
  )
}

/** Split plain text into text / inline-math segments (`$latex$`). */
export function splitTextWithInlineMath(
  text: string,
): Array<{ type: "text"; value: string } | { type: "math"; value: string }> {
  const parts: Array<
    { type: "text"; value: string } | { type: "math"; value: string }
  > = []
  const re = /\$([^$\n]+)\$/g
  let lastIndex = 0
  for (const match of text.matchAll(re)) {
    if (match.index === undefined) continue
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) })
    }
    const latex = match[1]?.trim()
    if (latex) {
      parts.push({ type: "math", value: latex })
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) })
  }
  return parts.length > 0 ? parts : [{ type: "text", value: text }]
}

export type MathRefDraft = {
  ref: number
  latex: string
}

export function formatMathRef(ref: number): string {
  return `(${ref})`
}

export function nextMathRef(drafts: Array<{ ref: number }>): number {
  let max = 0
  for (const draft of drafts) {
    if (draft.ref > max) max = draft.ref
  }
  return max + 1
}

/** Insert `(n)` at `cursor`, adding spaces when needed. */
export function insertMathRefToken(
  text: string,
  cursor: number,
  ref: number,
): { text: string; cursor: number } {
  const token = formatMathRef(ref)
  const pos = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, pos)
  const after = text.slice(pos)
  const left =
    before.length > 0 && !/\s$/.test(before) ? `${before} ` : before
  const right =
    after.length > 0 && !/^\s/.test(after) ? ` ${after}` : after
  const next = `${left}${token}${right}`
  return { text: next, cursor: left.length + token.length }
}

/** Remove all `(n)` tokens for a math ref and tidy spaces. */
export function removeMathRefFromText(text: string, ref: number): string {
  const re = new RegExp(`\\(${ref}\\)`, "g")
  return text
    .replace(re, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/\n[^\S\n]+/g, "\n")
}

type RenumberableMathDraft = {
  id: string
  ref: number
  latex: string
}

/**
 * After a math chip is removed: drop its token, then renumber remaining
 * drafts to 1..n and rewrite `(old)` → `(new)` in the prompt.
 */
export function removeAndRenumberMathRefs<T extends RenumberableMathDraft>(
  text: string,
  drafts: Array<T>,
  removedId: string,
): { text: string; drafts: Array<T> } {
  const removed = drafts.find((draft) => draft.id === removedId)
  const remaining = drafts.filter((draft) => draft.id !== removedId)
  const withoutRemoved = removed
    ? removeMathRefFromText(text, removed.ref)
    : text

  if (remaining.length === 0) {
    return { text: withoutRemoved, drafts: [] }
  }

  const sorted = [...remaining].sort((a, b) => a.ref - b.ref)

  // Placeholder pass avoids collisions when e.g. (3)→(2) while (2) still exists.
  let nextText = withoutRemoved
  for (const draft of sorted) {
    nextText = nextText.replaceAll(
      formatMathRef(draft.ref),
      `\u0000MATH:${draft.id}\u0000`,
    )
  }

  const renumbered = sorted.map((draft, index) => ({
    ...draft,
    ref: index + 1,
  }))

  for (const draft of renumbered) {
    nextText = nextText.replaceAll(
      `\u0000MATH:${draft.id}\u0000`,
      formatMathRef(draft.ref),
    )
  }

  return { text: nextText, drafts: renumbered }
}

/**
 * Expand `(1)` / `(2)` math refs in the prompt to `$latex$` for send/display.
 * Unknown parenthetical numbers are left unchanged.
 */
export function composePromptWithMath(
  prompt: string,
  drafts: Array<MathRefDraft>,
): string {
  const byRef = new Map(
    drafts
      .filter((draft) => draft.latex.trim().length > 0)
      .map((draft) => [draft.ref, draft.latex.trim()] as const),
  )
  if (byRef.size === 0) return prompt.trim()

  return prompt
    .replace(/\((\d+)\)/g, (match, num: string) => {
      const latex = byRef.get(Number(num))
      if (!latex) return match
      return `$${latex}$`
    })
    .trim()
}

/** 1-based index of an assistant message among assistant messages in the thread. */
export function assistantResponseNumber(
  messages: Array<{ role: string; key: string }>,
  messageKey: string,
): number | null {
  let number = 0
  for (const message of messages) {
    if (message.role !== "assistant") continue
    number += 1
    if (message.key === messageKey) return number
  }
  return null
}

/**
 * Citation tokens, e.g. `[citat svar 2: "text"]` or `[citat svar 2: (1)]`.
 */
export const CITATION_RE =
  /\[citat svar \d+(?:: (?:"[^"]*"|\(\d+\)))?\]/g

function sanitizeCitationContent(content: string): string {
  return content.trim().replace(/"/g, "'")
}

export function formatCitationPrefix(responseNumber: number): string {
  return `[citat svar ${responseNumber}]`
}

export function formatReplyToAssistant(
  responseNumber: number,
  label: string,
): string {
  return `[svarar på svar #${responseNumber}] ${label}`
}

/**
 * Build a citation body for the composer.
 * Text → `[citat svar N: "…"]`
 * Math ref `(n)` → `[citat svar N: (n)]` (unquoted, same shape)
 */
export function formatCitationBody(
  responseNumber: number,
  content: string,
): string {
  const trimmed = sanitizeCitationContent(content)
  if (!trimmed) return formatCitationPrefix(responseNumber)
  if (/^\(\d+\)$/.test(trimmed)) {
    return `[citat svar ${responseNumber}: ${trimmed}]`
  }
  return `[citat svar ${responseNumber}: "${trimmed}"]`
}

/** Insert citation text at `cursor`, adding spaces when needed. */
export function insertCitationAtCursor(
  text: string,
  cursor: number,
  citationBody: string,
): { text: string; cursor: number } {
  const body = citationBody.trim()
  if (!body) return { text, cursor }
  const pos = Math.max(0, Math.min(cursor, text.length))
  const before = text.slice(0, pos)
  const after = text.slice(pos)
  const left =
    before.length > 0 && !/\s$/.test(before) ? `${before} ` : before
  // Always leave a space after the citation so typing continues outside it.
  const right =
    after.length === 0 || !/^\s/.test(after) ? ` ${after}` : after
  const next = `${left}${body}${right}`
  return { text: next, cursor: left.length + body.length + 1 }
}
