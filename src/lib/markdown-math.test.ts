import { describe, expect, it } from "vitest"
import {
  chaptersFromMarkdown,
  isFallHeading,
  isSubproblemHeading,
  splitMarkdownMath,
  subproblemAnchorId,
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
