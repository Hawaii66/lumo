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
 * True when `offset` sits inside an already-open `$$...$$` block.
 * Used so we do not re-wrap `\begin{array}` that lives inside
 * `$$\left(...\begin{array}...\end{array}\right)$$` (that would split the
 * delimiters and leave the matrix as raw text).
 */
function isInsideDisplayMath(input: string, offset: number): boolean {
  let open = false
  for (let i = 0; i < offset; i++) {
    if (input[i] === "\\" && input[i + 1] === "$") {
      i += 1
      continue
    }
    if (input[i] === "$" && input[i + 1] === "$") {
      open = !open
      i += 1
    }
  }
  return open
}

/**
 * Split one array/matrix row on cell separators (`&`), respecting braces and `\&`.
 */
function splitLatexRowCells(row: string): Array<string> {
  const cells: Array<string> = []
  let cur = ""
  let depth = 0
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!
    if (ch === "{") {
      depth += 1
      cur += ch
      continue
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1)
      cur += ch
      continue
    }
    if (ch === "&" && depth === 0 && row[i - 1] !== "\\") {
      cells.push(cur.trim())
      cur = ""
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  return cells
}

/**
 * Split an array/matrix body into non-empty rows on `\\`.
 */
function splitLatexEnvRows(body: string): Array<string> {
  const rows: Array<string> = []
  let cur = ""
  let depth = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!
    if (ch === "{") {
      depth += 1
      cur += ch
      continue
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1)
      cur += ch
      continue
    }
    if (ch === "\\" && body[i + 1] === "\\" && depth === 0) {
      const trimmed = cur.replace(/\s+/g, " ").trim()
      if (trimmed.length > 0) rows.push(trimmed)
      cur = ""
      i += 1
      continue
    }
    cur += ch
  }
  const trimmed = cur.replace(/\s+/g, " ").trim()
  if (trimmed.length > 0) rows.push(trimmed)
  return rows
}

/**
 * MathLive metrics non-multiline `array` using only the first row's height, so
 * `\left(\begin{array}...\end{array}\right)` shows a blank gap above the
 * entries. Rewrite to centered `matrix` (and `\middle|` for augmented bars).
 */
export function prepareLatexForMathLive(latex: string): string {
  return latex.replace(
    /\\begin\{array\}\{([^}]*)\}([\s\S]*?)\\end\{array\}/g,
    (_match, colspec: string, body: string) => {
      const groupWidths = colspec
        .split("|")
        .map((group) => (group.match(/[clr]/gi) ?? []).length)
      const rows = splitLatexEnvRows(body)
      if (rows.length === 0) {
        return "\\begin{matrix}\\end{matrix}"
      }

      if (groupWidths.length <= 1) {
        return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`
      }

      const segments: Array<Array<string>> = groupWidths.map(() => [])
      for (const row of rows) {
        const cells = splitLatexRowCells(row)
        let offset = 0
        for (let g = 0; g < groupWidths.length; g++) {
          const width = groupWidths[g]!
          const slice = cells.slice(offset, offset + width)
          while (slice.length < width) slice.push("")
          segments[g]!.push(slice.join(" & "))
          offset += width
        }
      }

      return segments
        .map((segRows) => `\\begin{matrix}${segRows.join(" \\\\ ")}\\end{matrix}`)
        .join("\\middle|")
    },
  )
}

/**
 * Repair AI/OCR markdown so multi-line TeX envs become closed `$$...$$`
 * blocks without internal blank lines (blank lines would split paragraphs
 * before math parsing runs).
 *
 * Does not insert new `$$` when the env is already inside a display-math
 * block (e.g. augmented matrices wrapped as `$$\left(\begin{array}...\end{array}\right)$$`).
 */
export function normalizeMarkdownMathDelimiters(input: string): string {
  return input.replace(
    BLOCK_ENV_WITH_DOLLARS_RE,
    (match, open, preWs, envBody, _envName, postWs, _close, offset) => {
      const cleaned = String(envBody)
        .replace(/\n[ \t]*\n+/g, "\n")
        .trim()
      const lead = preWs?.includes("\n") ? "\n\n" : preWs || ""
      const trail = postWs?.includes("\n") ? "\n\n" : postWs || ""

      // Already a display-math block, or sitting inside one that continues past
      // this env (e.g. `$$\begin{pmatrix}...\end{pmatrix} = ...$$`). Only scrub
      // blank lines — never insert a premature closing `$$` after the first env.
      if (open === "$$" || isInsideDisplayMath(input, offset)) {
        return match.replace(String(envBody), cleaned)
      }

      // Bare env or single `$...$` around a multi-line env → `$$...$$`.
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

export type MarkdownTableAlignment = "left" | "center" | "right"

export type MarkdownTable = {
  headers: Array<string>
  alignments: Array<MarkdownTableAlignment>
  rows: Array<Array<string>>
}

/**
 * Split a GFM table row into cells.
 * Only `\|` is an escape (literal `|`). Other backslashes (LaTeX) are kept.
 */
export function splitMarkdownTableRow(line: string): Array<string> {
  const t = line.trim()
  const cells: Array<string> = []
  let cur = ""
  let i = t.startsWith("|") ? 1 : 0

  while (i < t.length) {
    // GFM-style escaped pipe only — do not strip LaTeX `\command`s.
    if (t[i] === "\\" && t[i + 1] === "|") {
      cur += "|"
      i += 2
      continue
    }
    if (t[i] === "|") {
      cells.push(cur.trim())
      cur = ""
      i += 1
      continue
    }
    cur += t[i]
    i += 1
  }

  if (cur.length > 0 || !t.endsWith("|")) {
    cells.push(cur.trim())
  }
  return cells
}

const TABLE_SEPARATOR_CELL_RE = /^:?-{3,}:?$/

export function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line)
  return (
    cells.length > 0 &&
    cells.every((cell) => TABLE_SEPARATOR_CELL_RE.test(cell.trim()))
  )
}

function alignmentFromSeparatorCell(cell: string): MarkdownTableAlignment {
  const t = cell.trim()
  const left = t.startsWith(":")
  const right = t.endsWith(":")
  if (left && right) return "center"
  if (right) return "right"
  return "left"
}

/** True when `lines[index]` is a header row followed by a GFM separator. */
export function isMarkdownTableStart(
  lines: Array<string>,
  index: number,
): boolean {
  if (index + 1 >= lines.length) return false
  const header = lines[index]!.trim()
  const separator = lines[index + 1]!.trim()
  if (!header.includes("|")) return false
  if (!isMarkdownTableSeparator(separator)) return false
  return splitMarkdownTableRow(header).length > 0
}

/**
 * Parse a GFM pipe table starting at `start`.
 * Returns null if the lines are not a table.
 */
export function tryParseMarkdownTableAt(
  lines: Array<string>,
  start: number,
): { table: MarkdownTable; end: number } | null {
  if (!isMarkdownTableStart(lines, start)) return null

  const headers = splitMarkdownTableRow(lines[start]!.trim())
  const sepCells = splitMarkdownTableRow(lines[start + 1]!.trim())
  const colCount = Math.max(headers.length, sepCells.length, 1)

  const alignments: Array<MarkdownTableAlignment> = []
  for (let c = 0; c < colCount; c++) {
    const cell = sepCells[c]
    alignments.push(cell ? alignmentFromSeparatorCell(cell) : "left")
  }

  while (headers.length < colCount) headers.push("")

  const rows: Array<Array<string>> = []
  let i = start + 2
  while (i < lines.length) {
    const trimmed = lines[i]!.trim()
    if (
      trimmed.length === 0 ||
      !trimmed.includes("|") ||
      isSubproblemHeading(trimmed) ||
      isFallHeading(trimmed) ||
      /^(#{1,4})\s+/.test(trimmed)
    ) {
      break
    }
    const cells = splitMarkdownTableRow(trimmed)
    while (cells.length < colCount) cells.push("")
    rows.push(cells.slice(0, colCount))
    i += 1
  }

  return {
    table: {
      headers: headers.slice(0, colCount),
      alignments,
      rows,
    },
    end: i,
  }
}
