import { describe, expect, it } from "vitest"
import {
  chaptersFromMarkdown,
  isFallHeading,
  isMarkdownTableSeparator,
  isMarkdownTableStart,
  isSubproblemHeading,
  normalizeMarkdownMathDelimiters,
  splitMarkdownMath,
  splitMarkdownTableRow,
  subproblemAnchorId,
  tryParseMarkdownTableAt,
} from "./markdown-math"

describe("splitMarkdownMath", () => {
  it("parses inline $...$ and block $$...$$", () => {
    expect(splitMarkdownMath("a $x$ b $$y$$ c")).toEqual([
      { kind: "text", content: "a " },
      { kind: "math", latex: "x", display: "inline" },
      { kind: "text", content: " b " },
      { kind: "math", latex: "y", display: "block" },
      { kind: "text", content: " c" },
    ])
  })

  it("parses TeX-style \\(...\\) and \\[...\\]", () => {
    expect(splitMarkdownMath(String.raw`pre \(a+b\) mid \[c\] post`)).toEqual([
      { kind: "text", content: "pre " },
      { kind: "math", latex: "a+b", display: "inline" },
      { kind: "text", content: " mid " },
      { kind: "math", latex: "c", display: "block" },
      { kind: "text", content: " post" },
    ])
  })

  it("treats \\$ as a literal dollar inside surrounding text", () => {
    expect(splitMarkdownMath(String.raw`cost is \$5 and $x$`)).toEqual([
      { kind: "text", content: String.raw`cost is \$5 and ` },
      { kind: "math", latex: "x", display: "inline" },
    ])
  })

  it("unescapes \\$ inside inline math", () => {
    expect(splitMarkdownMath(String.raw`$a \$ b$`)).toEqual([
      { kind: "math", latex: "a $ b", display: "inline" },
    ])
  })

  it("leaves unclosed $$ as text and treats EOF after $ as math", () => {
    expect(splitMarkdownMath("start $$no close")).toEqual([
      { kind: "text", content: "start $$no close" },
    ])
    expect(splitMarkdownMath("start $no close")).toEqual([
      { kind: "text", content: "start " },
      { kind: "math", latex: "no close", display: "inline" },
    ])
  })

  it("does not allow newlines inside inline $...$", () => {
    expect(splitMarkdownMath("a $x\ny b")).toEqual([
      { kind: "text", content: "a $x\ny b" },
    ])
  })
})

describe("normalizeMarkdownMathDelimiters", () => {
  it("closes unclosed $ around multi-line cases as block $$", () => {
    const raw = `Lös:

(a)

$\\begin{cases}
x_1 - x_2 = 0 \\\\

x_1 + x_2 = 0
\\end{cases}

(b)`
    const normalized = normalizeMarkdownMathDelimiters(raw)
    expect(normalized).toContain("$$\\begin{cases}")
    expect(normalized).toContain("\\end{cases}$$")
    expect(normalized).not.toMatch(/(?<!\$)\$(?!\$)\\begin\{cases\}/)
    expect(normalized).not.toMatch(/\\\\\n\n/)
    const segs = splitMarkdownMath(
      normalized.split(/\n\n/).find((p) => p.includes("begin{cases}"))!,
    )
    expect(segs.some((s) => s.kind === "math")).toBe(true)
  })

  it("wraps bare aligned env in $$", () => {
    const raw = String.raw`\begin{aligned} x&=1 \\ y&=2 \end{aligned}`
    expect(normalizeMarkdownMathDelimiters(raw)).toBe(
      String.raw`$$\begin{aligned} x&=1 \\ y&=2 \end{aligned}$$`,
    )
  })

  it("is idempotent for already-correct $$ blocks", () => {
    const raw = String.raw`$$\begin{cases} x=1 \\ y=2 \end{cases}$$`
    expect(normalizeMarkdownMathDelimiters(raw)).toBe(raw)
  })

  it("does not re-wrap array already inside $$\\left(...\\right)$$", () => {
    const raw = String.raw`$$\left(\begin{array}{cccc|c}
1 & -2 & 4 & -1 & -3 \\
2 & 1 & -1 & 3 & 7 \\
3 & 1 & 2 & 1 & 5
\end{array}\right)$$`
    const normalized = normalizeMarkdownMathDelimiters(raw)
    expect(normalized).toBe(raw)
    expect(normalized).not.toContain(String.raw`$$\left($$`)
    const segs = splitMarkdownMath(normalized)
    expect(segs).toEqual([
      {
        kind: "math",
        latex: String.raw`\left(\begin{array}{cccc|c}
1 & -2 & 4 & -1 & -3 \\
2 & 1 & -1 & 3 & 7 \\
3 & 1 & 2 & 1 & 5
\end{array}\right)`,
        display: "block",
      },
    ])
  })
})

describe("heading helpers", () => {
  it("detects subproblem headings", () => {
    expect(isSubproblemHeading("### (A)")).toBe("a")
    expect(isSubproblemHeading("## not")).toBeNull()
  })

  it("detects Fall headings and strips a leading colon", () => {
    expect(isFallHeading("### Fall 2: special")).toEqual({
      number: "2",
      rest: "special",
    })
    expect(isFallHeading("## Fall 10")).toEqual({ number: "10", rest: "" })
    expect(isFallHeading("## Hello")).toBeNull()
  })

  it("collects chapter offsets for subproblem headings", () => {
    const md = "# Title\n\n### (a)\ntext\n### (b)\n"
    expect(chaptersFromMarkdown(md)).toEqual([
      { index: 0, label: "a", offset: 9 },
      { index: 1, label: "b", offset: 22 },
    ])
  })

  it("sanitizes message keys in subproblem anchor ids", () => {
    expect(subproblemAnchorId("msg/key:1!", 2)).toBe(
      "lumo-subproblem-msg_key_1_-2",
    )
  })
})

describe("markdown tables", () => {
  it("splits rows and unescapes pipes without stripping LaTeX backslashes", () => {
    expect(splitMarkdownTableRow("| a | b | c |")).toEqual(["a", "b", "c"])
    expect(splitMarkdownTableRow("a | b | c")).toEqual(["a", "b", "c"])
    expect(splitMarkdownTableRow(String.raw`| a \| b | c |`)).toEqual([
      "a | b",
      "c",
    ])
    expect(
      splitMarkdownTableRow(
        String.raw`| $\searrow$ | MIN | $\nearrow$ |`,
      ),
    ).toEqual([String.raw`$\searrow$`, "MIN", String.raw`$\nearrow$`])
  })

  it("detects separator rows and alignments", () => {
    expect(isMarkdownTableSeparator("| --- | :---: | ---: |")).toBe(true)
    expect(isMarkdownTableSeparator("| foo | bar |")).toBe(false)
  })

  it("parses a full GFM table with alignment", () => {
    const lines = [
      "| Namn | Värde | Diff |",
      "| :--- | :---: | ---: |",
      "| $x$ | **2** | 3 |",
      "| y | 4 | 5 |",
      "",
      "Efter tabellen",
    ]
    expect(isMarkdownTableStart(lines, 0)).toBe(true)
    expect(tryParseMarkdownTableAt(lines, 0)).toEqual({
      table: {
        headers: ["Namn", "Värde", "Diff"],
        alignments: ["left", "center", "right"],
        rows: [
          ["$x$", "**2**", "3"],
          ["y", "4", "5"],
        ],
      },
      end: 4,
    })
  })

  it("rejects a pipe line without a separator", () => {
    const lines = ["| not | a | table |", "bara text"]
    expect(isMarkdownTableStart(lines, 0)).toBe(false)
    expect(tryParseMarkdownTableAt(lines, 0)).toBeNull()
  })
})
