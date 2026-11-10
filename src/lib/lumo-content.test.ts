import { describe, expect, it } from "vitest"
import { parseLumoParsedProblems } from "./lumo-content"

describe("parseLumoParsedProblems", () => {
  it("returns empty problems for blank input", () => {
    expect(parseLumoParsedProblems("  \n  ")).toEqual({
      problems: [],
      error: null,
    })
  })

  it("parses a single problem object", () => {
    expect(
      parseLumoParsedProblems(
        JSON.stringify({
          problemNumber: "1.1",
          question: "Q",
          answer: "A",
        }),
      ),
    ).toEqual({
      problems: [
        {
          problemNumber: "1.1",
          question: "Q",
          answer: "A",
        },
      ],
      error: null,
    })
  })

  it("parses an array and optional flags", () => {
    expect(
      parseLumoParsedProblems(
        JSON.stringify([
          {
            problemNumber: "2",
            question: "q",
            answer: "a",
            flags: [{ kind: "needs_pdf", data: {} }],
          },
        ]),
      ),
    ).toEqual({
      problems: [
        {
          problemNumber: "2",
          question: "q",
          answer: "a",
          flags: [{ kind: "needs_pdf", data: {} }],
        },
      ],
      error: null,
    })
  })

  it("accepts a trailing comma after a JSON object (wraps as array)", () => {
    expect(
      parseLumoParsedProblems(
        '{"problemNumber":"3","question":"q","answer":"a"},',
      ),
    ).toEqual({
      problems: [{ problemNumber: "3", question: "q", answer: "a" }],
      error: null,
    })
  })

  it("accepts JS object-literal paste via Function fallback", () => {
    const pasted = `{
      problemNumber: "3",
      question: "q",
      answer: "a"
    }`
    expect(parseLumoParsedProblems(pasted)).toEqual({
      problems: [{ problemNumber: "3", question: "q", answer: "a" }],
      error: null,
    })
  })

  it("returns a Swedish error for invalid JSON", () => {
    expect(parseLumoParsedProblems("not json")).toEqual({
      problems: [],
      error: "Ogiltig JSON — klistra in ett problem-objekt eller en array.",
    })
  })

  it("returns a field error for invalid problem objects", () => {
    expect(
      parseLumoParsedProblems(
        JSON.stringify([{ problemNumber: "", question: "q", answer: "a" }]),
      ),
    ).toEqual({
      problems: [],
      error:
        "Objekt 1: förväntade problemNumber, question (markdown), answer (markdown).",
    })
  })
})
