import { describe, expect, it } from "vitest"
import type { MiddleJson } from "./mineruSchema"
import { flattenMiddleJson, splitIntoProblemChunks } from "./middleJson"

describe("splitIntoProblemChunks page indices", () => {
  it("keeps first question and answer page indices only", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "paragraph_title", content: "Problem" },
            { type: "text", content: "Preamble before problems" },
          ],
        },
        {
          page_idx: 1,
          blocks: [{ type: "text", content: "More preamble" }],
        },
        {
          page_idx: 2,
          blocks: [
            { type: "text", content: "1.2 First question stem." },
            { type: "text", content: "Continuation of stem." },
          ],
        },
        {
          page_idx: 3,
          blocks: [{ type: "text", content: "Still on question 1.2 later page." }],
        },
        {
          page_idx: 4,
          blocks: [{ type: "text", content: "2.1 Second question." }],
        },
        {
          page_idx: 9,
          blocks: [
            { type: "paragraph_title", content: "Svar" },
            { type: "text", content: "Answer preamble" },
          ],
        },
        {
          page_idx: 10,
          blocks: [
            { type: "text", content: "1.2 First answer." },
            { type: "text", content: "More of first answer." },
          ],
        },
        {
          page_idx: 11,
          blocks: [{ type: "text", content: "1.2 answer continues later." }],
        },
        {
          page_idx: 12,
          blocks: [{ type: "text", content: "2.1 Second answer." }],
        },
      ],
    }

    const { problemTokens, answerTokens } = flattenMiddleJson(middleJson)
    const chunks = splitIntoProblemChunks(problemTokens, answerTokens)

    expect(chunks).toHaveLength(2)

    const first = chunks.find((c) => c.problemNumber === "1.2")
    expect(first).toBeDefined()
    expect(first!.sourceQuestionPageIdx).toBe(2)
    expect(first!.sourceAnswerPageIdx).toBe(10)

    const second = chunks.find((c) => c.problemNumber === "2.1")
    expect(second).toBeDefined()
    expect(second!.sourceQuestionPageIdx).toBe(4)
    expect(second!.sourceAnswerPageIdx).toBe(12)
  })

  it("omits answer page when facit is missing", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "paragraph_title", content: "Problem" },
            { type: "text", content: "3. First only question." },
          ],
        },
        {
          page_idx: 1,
          blocks: [{ type: "paragraph_title", content: "Svar" }],
        },
      ],
    }

    const { problemTokens, answerTokens } = flattenMiddleJson(middleJson)
    const chunks = splitIntoProblemChunks(problemTokens, answerTokens)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.problemNumber).toBe("3")
    expect(chunks[0]!.sourceQuestionPageIdx).toBe(0)
    expect(chunks[0]!.sourceAnswerPageIdx).toBeUndefined()
  })

  it("falls back to page array index when page_idx is absent", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          blocks: [
            { type: "paragraph_title", content: "Problem" },
            { type: "text", content: "1. Stem." },
          ],
        },
        {
          blocks: [
            { type: "paragraph_title", content: "Svar" },
            { type: "text", content: "1. Facit." },
          ],
        },
      ],
    }

    const { problemTokens, answerTokens } = flattenMiddleJson(middleJson)
    const chunks = splitIntoProblemChunks(problemTokens, answerTokens)

    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.sourceQuestionPageIdx).toBe(0)
    expect(chunks[0]!.sourceAnswerPageIdx).toBe(1)
  })
})
