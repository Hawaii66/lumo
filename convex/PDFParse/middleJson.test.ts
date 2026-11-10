import { describe, expect, it } from "vitest"
import type { MiddleJson } from "./mineruSchema"
import {
  detectProblemChunks,
  getTextBlockLead,
  matchLabelStart,
} from "./middleJson"

describe("detectProblemChunks", () => {
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

    const chunks = detectProblemChunks(middleJson)
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

    const chunks = detectProblemChunks(middleJson)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.problemNumber).toBe("3")
    expect(chunks[0]!.sourceQuestionPageIdx).toBe(0)
    expect(chunks[0]!.sourceAnswerPageIdx).toBeUndefined()
  })

  it("ignores equation crops and only keeps figure/table/chart images", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "text", content: "1.2 Stem with math." },
            {
              type: "equation",
              image_path: "images/page_0_equation_0.jpg",
              content: "x^2",
            } as never,
            {
              type: "image",
              image_path: "images/page_0_image_1.jpg",
              content: "",
            } as never,
          ],
        },
      ],
    }

    const chunks = detectProblemChunks(middleJson)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.questionImages).toEqual([
      { path: "images/page_0_image_1.jpg", subproblemLetter: "" },
    ])
  })

  it("tags images with the current deluppgift letter", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "text", content: "1.2 Intro stem." },
            {
              type: "image",
              image_path: "images/stem.jpg",
              content: "",
            } as never,
            { type: "text", content: "(a) First part." },
            {
              type: "image",
              image_path: "images/a.jpg",
              content: "",
            } as never,
            { type: "text", content: "(b) Second part." },
            {
              type: "image",
              image_path: "images/b.jpg",
              content: "",
            } as never,
          ],
        },
      ],
    }

    const chunks = detectProblemChunks(middleJson)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.questionImages).toEqual([
      { path: "images/stem.jpg", subproblemLetter: "" },
      { path: "images/a.jpg", subproblemLetter: "a" },
      { path: "images/b.jpg", subproblemLetter: "b" },
    ])
  })

  it("falls back to page array index when page_idx is absent", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          blocks: [{ type: "text", content: "1. Stem." }],
        },
        {
          blocks: [{ type: "text", content: "1. Facit." }],
        },
      ],
    }

    const chunks = detectProblemChunks(middleJson)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.sourceQuestionPageIdx).toBe(0)
    expect(chunks[0]!.sourceAnswerPageIdx).toBe(1)
  })

  it("pairs 1a)/1b)/1c) facit with question 1 using content[0] leads only", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            {
              type: "text",
              content: [
                { type: "text", content: "1. Undersök gränsvärdena (a) " },
                { type: "equation_inline", content: "\\lim A" },
              ],
            },
            { type: "text", content: "2. Skissa kurvan y = f(x)." },
          ],
        },
        {
          page_idx: 1,
          blocks: [
            {
              type: "paragraph_title",
              content: "Lösningsskisser för TATA41 260114",
            },
            {
              type: "text",
              content: [
                { type: "text", content: "1a) " },
                { type: "equation_inline", content: "\\lim = 1/2" },
                { type: "text", content: " 1b) lim B = 0. 1c) lim C = e/2. Svar: (a) 1/2 (b) 0 (c) e/2." },
              ],
            },
            {
              type: "text",
              content: "2) f har lokal max i x = 1. Svar: se grafen.",
            },
          ],
        },
      ],
    }

    const chunks = detectProblemChunks(middleJson)
    expect(chunks.map((c) => c.problemNumber)).toEqual(["1", "2"])

    const first = chunks.find((c) => c.problemNumber === "1")
    expect(first!.problemText).toContain("Undersök")
    expect(first!.problemText).not.toContain("konjugat")
    expect(first!.answerText).toMatch(/1\s*\/\s*2/)
    expect(first!.sourceAnswerPageIdx).toBe(1)

    const second = chunks.find((c) => c.problemNumber === "2")
    expect(second!.answerText.toLowerCase()).toContain("grafen")
  })

  it("does not treat mid-prose 2p. / 3p as labels", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            {
              type: "text",
              content: [
                {
                  type: "text",
                  content:
                    "Med godkänd uppgift menas en uppgift som bedömts med minst 2p. För godkänd tentamen (betyg ",
                },
                { type: "equation_inline", content: "3/4/5" },
                {
                  type: "text",
                  content: ") räcker krav K1, K2 och K3, där",
                },
              ],
            },
            {
              type: "text",
              content:
                "• Del A1 består av 2 uppgifter, numrerade 1 och 2, värda 3p var.",
            },
            {
              type: "text",
              content: [
                { type: "text", content: "1. Undersök gränsvärdena" },
              ],
            },
            { type: "text", content: "2. Skissa kurvan." },
            { type: "text", content: "3. Beräkna integralen." },
          ],
        },
        {
          page_idx: 1,
          blocks: [
            { type: "text", content: "1a) Svar: 1/2." },
            { type: "text", content: "2) Svar: se grafen." },
            { type: "text", content: "3a) Svar: ln|x|." },
          ],
        },
      ],
    }

    const chunks = detectProblemChunks(middleJson)
    expect(chunks.map((c) => c.problemNumber)).toEqual(["1", "2", "3"])
    expect(chunks.find((c) => c.problemNumber === "2")!.problemText).toContain(
      "Skissa",
    )
    expect(
      chunks.find((c) => c.problemNumber === "2")!.problemText,
    ).not.toContain("K1")
  })

  it("pairs booklet P x.y questions with restarted answers", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "header", content: "12 Problem" },
            {
              type: "text",
              content: [
                { type: "text", content: "P 3.1 (a) Vilka pilar? (b) Är det så?" },
              ],
            },
            { type: "text", content: "P 3.2 Övertyga dig om olikheten." },
            { type: "text", content: "P 4.1 Derivera sin x." },
          ],
        },
        {
          page_idx: 1,
          blocks: [
            { type: "header", content: "Svar 49" },
            { type: "text", content: "P 3.1 (a) Bara ⇐. (b) Nej." },
            { type: "text", content: "P 3.2 Addera 4 till alla led." },
            { type: "text", content: "P 4.1 cos x." },
          ],
        },
      ],
    }

    const chunks = detectProblemChunks(middleJson)
    expect(chunks.map((c) => c.problemNumber)).toEqual(["3.1", "3.2", "4.1"])
    expect(chunks.find((c) => c.problemNumber === "3.1")!.answerText).toContain(
      "Bara",
    )
  })

  it("does not treat chapter titles like '3 Gränsvärde' as problems", () => {
    const chunks = detectProblemChunks({
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "text", content: "3 Gränsvärde och kontinuitet" },
            { type: "text", content: "P 3.1 First real problem." },
            { type: "text", content: "P 3.1 First facit." },
          ],
        },
      ],
    })
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.problemNumber).toBe("3.1")
  })

  it("getTextBlockLead only reads content[0] text parts", () => {
    expect(
      getTextBlockLead({
        type: "text",
        content: [
          { type: "text", content: "1a) lim" },
          { type: "equation_inline", content: "x" },
        ],
      }),
    ).toBe("1a) lim")

    expect(
      getTextBlockLead({
        type: "text",
        content: [
          { type: "equation_inline", content: "x" },
          { type: "text", content: "1. later" },
        ],
      }),
    ).toBeNull()

    expect(matchLabelStart("2p. För godkänd")).toBeNull()
    expect(matchLabelStart("1a) lim")).toMatchObject({
      problemNumber: "1",
      subproblemLetter: "a",
    })
    expect(matchLabelStart("P 3.3, kontinuerlig")).toBeNull()
  })

  it("does not false-restart on wrapped cross-ref 'P 3.3,' inside a later problem", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "text", content: "P 3.1 First question." },
            { type: "text", content: "P 3.2 Second question." },
            {
              type: "text",
              content: "P 3.14 Är funktionen g, vars graf ges i uppgift",
            },
            // MinerU wrapped the line so the next block starts mid cross-ref.
            {
              type: "text",
              content: "P 3.3, kontinuerlig (a) i punkten 1?",
            },
            { type: "text", content: "(b) i punkten 2?" },
            { type: "text", content: "P 3.15 Third after fourteen." },
            { type: "text", content: "P 4.1 Later chapter." },
          ],
        },
        {
          page_idx: 1,
          blocks: [
            { type: "text", content: "P 3.1 First facit." },
            { type: "text", content: "P 3.2 Second facit." },
            { type: "text", content: "P 3.14 (a) nej (b) ja." },
            { type: "text", content: "P 3.15 Positivt." },
            { type: "text", content: "P 4.1 cos x." },
          ],
        },
      ],
    }

    const chunks = detectProblemChunks(middleJson)
    expect(chunks.map((c) => c.problemNumber)).toEqual([
      "3.1",
      "3.2",
      "3.14",
      "3.15",
      "4.1",
    ])

    const p314 = chunks.find((c) => c.problemNumber === "3.14")
    expect(p314!.problemText).toContain("uppgift")
    expect(p314!.problemText).toContain("kontinuerlig")
    expect(p314!.problemText).toContain("punkten 1")
    expect(p314!.answerText).toContain("nej")

    const p315 = chunks.find((c) => c.problemNumber === "3.15")
    expect(p315!.problemText).toContain("Third after fourteen")
    expect(p315!.answerText).toContain("Positivt")
  })

  it("keeps worked solution when Svar is only se ovan", () => {
    const middleJson: MiddleJson = {
      pages: [
        {
          page_idx: 0,
          blocks: [
            { type: "text", content: "6. Bevisa påståendet." },
            { type: "text", content: "7. Bestäm extremvärdena." },
          ],
        },
        {
          page_idx: 1,
          blocks: [
            {
              type: "text",
              content:
                "6. Vi antar att villkoret gäller. Då följer att påståendet är sant genom induktion.\nSvar: se ovan.",
            },
            {
              type: "text",
              content:
                "7. Derivatan nollställs i x = 1. Andra derivatan är negativ, så max.\nSvar: se ovan",
            },
          ],
        },
      ],
    }

    const chunks = detectProblemChunks(middleJson)
    const six = chunks.find((c) => c.problemNumber === "6")
    expect(six!.answerText).toContain("induktion")
    expect(six!.answerText.toLowerCase()).toContain("se ovan")

    const seven = chunks.find((c) => c.problemNumber === "7")
    expect(seven!.answerText).toContain("Derivatan")
    expect(seven!.answerText.toLowerCase()).toContain("se ovan")
  })
})
