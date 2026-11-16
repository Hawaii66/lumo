export type MathSegment =
  | { kind: "text"; content: string }
  | { kind: "math"; latex: string; display: "inline" | "block" }

type ChapterHeading = {
  /** Index among subproblem headings (0-based). */
  index: number
  label: string
  /** Character offset of the heading line start in the source markdown. */
  offset: number
}

const SUBPROBLEM_HEADING_RE = /^(#{2,4})\s*\(([a-z])\)\s*$/i
const FALL_HEADING_RE = /^(#{2,4})\s*Fall\s+(\d+)\b(.*)$/i

/**
 * Multi-line TeX environments that must be block math (`$$...$$`).
 * Models often emit a lone opening `$` (or bare env) with no closer.
 */
const BLOCK_MATH_ENV =
  String.raw`cases|aligned|align\*?|gather\*?|eqnarray\*?|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|array`

/** Match optional `$`/`$$` around a block env; capture the env body. */
const BLOCK_ENV_WITH_DOLLARS_RE = new RegExp(
  String.raw`(\$\$|\$)?(\s*)(\\begin\{(${BLOCK_MATH_ENV})\}[\s\S]*?\\end\{\4\})(\s*)(\$\$|\$)?`,
  "g",
)

/**
 * Repair AI/OCR markdown so multi-line TeX envs become closed `$$...$$`
 * blocks without internal blank lines (blank lines would split paragraphs
 * before math parsing runs).
 */
export function normalizeMarkdownMathDelimiters(input: string): string {
  return input.replace(
    BLOCK_ENV_WITH_DOLLARS_RE,
    (_match, _open, preWs, envBody, _envName, postWs) => {
      const cleaned = String(envBody)
        .replace(/\n[ \t]*\n+/g, "\n")
        .trim()
      const lead = preWs?.includes("\n") ? "\n\n" : preWs || ""
      const trail = postWs?.includes("\n") ? "\n\n" : postWs || ""
      return `${lead}$$${cleaned}$$${trail}`
    },
  )
}

/** Index of the next two-char closer (`\)` / `\]`), or -1. */
function indexOfTexCloser(
  input: string,
  from: number,
  closer: ")" | "]",
  allowNewline: boolean,
): number {
  for (let j = from; j < input.length - 1; j++) {
    if (!allowNewline && input[j] === "\n") return -1
    if (input[j] === "\\" && input[j + 1] === closer) return j
  }
  return -1
}

/**
 * Split markdown into text and math segments.
 * Supports `$...$` / `\(...\)` (inline) and `$$...$$` / `\[...\]` (block).
 * `\$` is a literal dollar.
 */
export function splitMarkdownMath(input: string): Array<MathSegment> {
  const segments: Array<MathSegment> = []
  let i = 0
  let textStart = 0

  const pushText = (end: number) => {
    if (end > textStart) {
      segments.push({ kind: "text", content: input.slice(textStart, end) })
    }
  }

  while (i < input.length) {
    if (input[i] === "\\" && input[i + 1] === "$") {
      i += 2
      continue
    }

    if (input[i] === "$" && input[i + 1] === "$") {
      const close = input.indexOf("$$", i + 2)
      if (close === -1) {
        i += 2
        continue
      }
      pushText(i)
      const latex = input.slice(i + 2, close).trim()
      if (latex.length > 0) {
        segments.push({ kind: "math", latex, display: "block" })
      }
      i = close + 2
      textStart = i
      continue
    }

    if (input[i] === "$") {
      let j = i + 1
      while (j < input.length) {
        if (input[j] === "\\" && input[j + 1] === "$") {
          j += 2
          continue
        }
        if (input[j] === "$") break
        if (input[j] === "\n") {
          j = -1
          break
        }
        j += 1
      }
      if (j > i) {
        pushText(i)
        const latex = input
          .slice(i + 1, j)
          .replace(/\\\$/g, "$")
          .trim()
        if (latex.length > 0) {
          segments.push({ kind: "math", latex, display: "inline" })
        }
        i = j + 1
        textStart = i
        continue
      }
    }

    // TeX-style block: \[...\]
    if (input[i] === "\\" && input[i + 1] === "[") {
      const close = indexOfTexCloser(input, i + 2, "]", true)
      if (close === -1) {
        i += 2
        continue
      }
      pushText(i)
      const latex = input.slice(i + 2, close).trim()
      if (latex.length > 0) {
        segments.push({ kind: "math", latex, display: "block" })
      }
      i = close + 2
      textStart = i
      continue
    }

    // TeX-style inline: \(...\)
    if (input[i] === "\\" && input[i + 1] === "(") {
      const close = indexOfTexCloser(input, i + 2, ")", false)
      if (close === -1) {
        i += 2
        continue
      }
      pushText(i)
      const latex = input.slice(i + 2, close).trim()
      if (latex.length > 0) {
        segments.push({ kind: "math", latex, display: "inline" })
      }
      i = close + 2
      textStart = i
      continue
    }

    i += 1
  }

  pushText(input.length)
  return segments
}

/** Collect ### (a) style headings for chapter navigation. */
export function chaptersFromMarkdown(markdown: string): Array<ChapterHeading> {
  const chapters: Array<ChapterHeading> = []
  let offset = 0
  for (const line of markdown.split("\n")) {
    const match = line.trim().match(SUBPROBLEM_HEADING_RE)
    if (match) {
      chapters.push({
        index: chapters.length,
        label: match[2]!.toLowerCase(),
        offset,
      })
    }
    offset += line.length + 1
  }
  return chapters
}

export function subproblemAnchorId(
  messageKey: string,
  chapterIndex: number,
): string {
  const safeKey = messageKey.replace(/[^a-zA-Z0-9_-]/g, "_")
  return `lumo-subproblem-${safeKey}-${chapterIndex}`
}

export function isSubproblemHeading(line: string): string | null {
  const match = line.trim().match(SUBPROBLEM_HEADING_RE)
  return match ? match[2]!.toLowerCase() : null
}

export function isFallHeading(
  line: string,
): { number: string; rest: string } | null {
  const match = line.trim().match(FALL_HEADING_RE)
  if (!match) return null
  return { number: match[2]!, rest: (match[3] ?? "").replace(/^:\s*/, "").trim() }
}
