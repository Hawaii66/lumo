import { describe, expect, it } from "vitest"
import {
  appendUserTextToPrompt,
  assistantResponseNumber,
  composePromptWithMath,
  fileSlugFromName,
  filterProblemOptions,
  filterSlashCommands,
  findAllMentions,
  findMentionQueryAtCursor,
  findSlashQueryAtCursor,
  formatCitationBody,
  formatMathRef,
  formatProblemMention,
  formatProblemMentionToken,
  formatReplyToAssistant,
  insertCitationAtCursor,
  insertMathRefToken,
  mentionTokenKey,
  nextMathRef,
  removeAndRenumberMathRefs,
  resolveDraftMentions,
  splitTextWithInlineMath,
  type ProblemMentionOption,
} from "./chat-composer"

const options: Array<ProblemMentionOption> = [
  { id: "p1", problemNumber: "1.2", fileName: "tenta 2023-03.pdf" },
  { id: "p2", problemNumber: "1.2", fileName: "facit.pdf" },
  { id: "p3", problemNumber: "3", fileName: "tenta.pdf" },
  { id: "p4", problemNumber: "3a", fileName: "ovning.pdf" },
]

describe("fileSlugFromName / formatProblemMention", () => {
  it("strips .pdf and collapses whitespace", () => {
    expect(fileSlugFromName("  tenta 2023-03.PDF  ")).toBe("tenta_2023-03")
  })

  it("formats mention token and full mention with slug", () => {
    expect(formatProblemMentionToken(" 3 ", "tenta.pdf")).toBe("3-tenta")
    expect(formatProblemMention("3", "tenta.pdf")).toBe("@3-tenta")
  })
})

describe("findAllMentions", () => {
  it("parses bare and slugged mentions, preferring slug form", () => {
    const mentions = findAllMentions("Se @1.2 och @1.2-tenta_2023-03 samt @3a")
    expect(mentions).toEqual([
      {
        raw: "@1.2",
        number: "1.2",
        start: 3,
        end: 7,
      },
      {
        raw: "@1.2-tenta_2023-03",
        number: "1.2",
        fileSlug: "tenta_2023-03",
        start: 12,
        end: 30,
      },
      {
        raw: "@3a",
        number: "3a",
        start: 36,
        end: 39,
      },
    ])
  })

  it("does not split @1.2-tenta into bare @1.2", () => {
    const mentions = findAllMentions("@1.2-tenta")
    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({
      number: "1.2",
      fileSlug: "tenta",
    })
  })
})

describe("resolveDraftMentions", () => {
  it("resolves unique matches and reports missing", () => {
    expect(resolveDraftMentions("kolla @3-tenta", options)).toEqual([
      {
        status: "resolved",
        problemId: "p3",
        problemNumber: "3",
        fileName: "tenta.pdf",
      },
    ])
    expect(resolveDraftMentions("@9-missing", options)).toEqual([
      {
        status: "missing",
        problemNumber: "9",
        fileSlug: "missing",
      },
    ])
  })

  it("marks bare number ambiguous when multiple files share it", () => {
    const result = resolveDraftMentions("@1.2", options)
    expect(result).toHaveLength(1)
    expect(result[0]!.status).toBe("ambiguous")
    if (result[0]!.status === "ambiguous") {
      expect(result[0]!.options.map((o) => o.id)).toEqual(["p1", "p2"])
    }
  })

  it("dedupes by token and by resolved problem id (first-seen)", () => {
    expect(
      resolveDraftMentions("@3-tenta hej @3-tenta igen @3", options),
    ).toEqual([
      {
        status: "resolved",
        problemId: "p3",
        problemNumber: "3",
        fileName: "tenta.pdf",
      },
    ])
  })
})

describe("mentionTokenKey", () => {
  it("uses file slug for resolved and unresolved mentions", () => {
    expect(
      mentionTokenKey({
        status: "resolved",
        problemId: "p3",
        problemNumber: "3",
        fileName: "tenta.pdf",
      }),
    ).toBe("3-tenta")
    expect(
      mentionTokenKey({
        status: "missing",
        problemNumber: "9",
        fileSlug: "x",
      }),
    ).toBe("9-x")
    expect(
      mentionTokenKey({ status: "missing", problemNumber: "9" }),
    ).toBe("9")
  })
})

describe("findMentionQueryAtCursor", () => {
  it("returns query for incomplete mention at cursor", () => {
    expect(findMentionQueryAtCursor("hej @1.2-ten", 12)).toEqual({
      start: 4,
      query: "1.2-ten",
    })
    expect(findMentionQueryAtCursor("@", 1)).toEqual({ start: 0, query: "" })
  })

  it("returns null when cursor is not inside a mention", () => {
    expect(findMentionQueryAtCursor("hej @1.2 mer", 12)).toBeNull()
  })
})

describe("slash commands", () => {
  it("finds slash query at cursor", () => {
    expect(findSlashQueryAtCursor("/for", 4)).toEqual({
      start: 0,
      query: "for",
    })
    expect(findSlashQueryAtCursor("text /läge", 10)).toEqual({
      start: 5,
      query: "läge",
    })
    expect(findSlashQueryAtCursor("a/b", 3)).toBeNull()
  })

  it("filters slash commands by prefix", () => {
    expect(filterSlashCommands("").map((c) => c.id)).toEqual([
      "formel",
      "mode",
    ])
    expect(filterSlashCommands("for").map((c) => c.command)).toEqual([
      "formel",
    ])
    expect(filterSlashCommands("läge").map((c) => c.id)).toEqual(["mode"])
    expect(filterSlashCommands("zzz")).toEqual([])
  })
})

describe("filterProblemOptions", () => {
  it("filters by number or slug and sorts by file then number", () => {
    expect(filterProblemOptions(options, "1.2").map((o) => o.id)).toEqual([
      "p2",
      "p1",
    ])
    expect(filterProblemOptions(options, "fac").map((o) => o.id)).toEqual([
      "p2",
    ])
    expect(
      filterProblemOptions(options, "1.2-tenta").map((o) => o.id),
    ).toEqual(["p1"])
  })

  it("returns all options sorted when query is empty", () => {
    expect(filterProblemOptions(options, "").map((o) => o.id)).toEqual([
      "p2",
      "p4",
      "p1",
      "p3",
    ])
  })
})

describe("appendUserTextToPrompt", () => {
  it("joins, or returns whichever side is non-empty", () => {
    expect(appendUserTextToPrompt("auto", "extra")).toBe("auto extra")
    expect(appendUserTextToPrompt("auto", "  ")).toBe("auto")
    expect(appendUserTextToPrompt("  ", "extra")).toBe("extra")
  })
})

describe("splitTextWithInlineMath", () => {
  it("splits text and $latex$ segments", () => {
    expect(splitTextWithInlineMath("a $x^2$ b")).toEqual([
      { type: "text", value: "a " },
      { type: "math", value: "x^2" },
      { type: "text", value: " b" },
    ])
  })

  it("returns a single text segment when no math", () => {
    expect(splitTextWithInlineMath("plain")).toEqual([
      { type: "text", value: "plain" },
    ])
  })
})

describe("math refs", () => {
  it("formats and allocates next refs", () => {
    expect(formatMathRef(3)).toBe("(3)")
    expect(nextMathRef([])).toBe(1)
    expect(nextMathRef([{ ref: 1 }, { ref: 4 }])).toBe(5)
  })

  it("inserts math ref with surrounding spaces when needed", () => {
    expect(insertMathRefToken("ab", 1, 1)).toEqual({
      text: "a (1) b",
      cursor: 5,
    })
    expect(insertMathRefToken("a ", 2, 2)).toEqual({
      text: "a (2)",
      cursor: 5,
    })
  })

  it("removes a chip and renumbers remaining refs without collisions", () => {
    const result = removeAndRenumberMathRefs(
      "se (1) och (2) och (3)",
      [
        { id: "a", ref: 1, latex: "x" },
        { id: "b", ref: 2, latex: "y" },
        { id: "c", ref: 3, latex: "z" },
      ],
      "b",
    )
    expect(result.drafts.map((d) => ({ id: d.id, ref: d.ref }))).toEqual([
      { id: "a", ref: 1 },
      { id: "c", ref: 2 },
    ])
    expect(result.text).toBe("se (1) och och (2)")
  })

  it("expands known math refs to $latex$ and leaves unknown alone", () => {
    expect(
      composePromptWithMath("beräkna (1) och (9)", [
        { ref: 1, latex: "x^2" },
        { ref: 2, latex: "  " },
      ]),
    ).toBe("beräkna $x^2$ och (9)")
    expect(composePromptWithMath("  hej  ", [])).toBe("hej")
  })
})

describe("citations and assistant numbering", () => {
  it("numbers assistant messages 1-based among assistants only", () => {
    const messages = [
      { role: "user", key: "u1" },
      { role: "assistant", key: "a1" },
      { role: "user", key: "u2" },
      { role: "assistant", key: "a2" },
    ]
    expect(assistantResponseNumber(messages, "a1")).toBe(1)
    expect(assistantResponseNumber(messages, "a2")).toBe(2)
    expect(assistantResponseNumber(messages, "missing")).toBeNull()
  })

  it("formats reply-to and citation bodies", () => {
    expect(formatReplyToAssistant(2, "fråga")).toBe(
      "[svarar på svar #2] fråga",
    )
    expect(formatCitationBody(2, "")).toBe("[citat svar 2]")
    expect(formatCitationBody(2, '(1)')).toBe("[citat svar 2: (1)]")
    expect(formatCitationBody(2, 'hej "du"')).toBe(
      `[citat svar 2: "hej 'du'"]`,
    )
  })

  it("inserts citation with trailing space for continued typing", () => {
    expect(insertCitationAtCursor("ab", 1, '[citat svar 1: "x"]')).toEqual({
      text: 'a [citat svar 1: "x"] b',
      cursor: 22,
    })
    expect(insertCitationAtCursor("hi", 2, "  ")).toEqual({
      text: "hi",
      cursor: 2,
    })
  })
})
