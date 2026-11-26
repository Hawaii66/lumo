import { describe, expect, it } from "vitest";
import {
  FALLBACK_PROBLEM_NUMBER_FORMAT,
  enrichFormatWithInferredPga,
  inferPgaFormatFromLeads,
  normalizeProblemNumberFormat,
  parsePgaFormat,
  FORMAT_MAJOR_RESTART,
} from "./problemNumberFormat";

describe("parsePgaFormat", () => {
  it("parses paren, glued, and spaced templates", () => {
    expect(parsePgaFormat("2(a)")).toEqual({
      style: "paren",
      numberSegments: 1,
    });
    expect(parsePgaFormat("1.2 a)")).toEqual({
      style: "spaced",
      numberSegments: 2,
    });
    expect(parsePgaFormat("3a)")).toEqual({
      style: "glued",
      numberSegments: 1,
    });
    expect(parsePgaFormat(null)).toBeNull();
    expect(parsePgaFormat("nope")).toBeNull();
  });
});

describe("inferPgaFormatFromLeads", () => {
  it("infers glued 1a) from envar-style facit leads", () => {
    expect(
      inferPgaFormatFromLeads(
        [
          "1. Undersök gränsvärdena",
          "2. Skissa grafen",
          "1a) lim = …",
          "1b) lim = …",
          "1c) lim = …",
          "3a) Partialintegration",
        ],
        { segmentCount: 1 },
      ),
    ).toBe("1a)");
  });

  it("prefers majority style and respects segmentCount", () => {
    expect(
      inferPgaFormatFromLeads(["1.2(a) text", "1.2(b) more", "3a) noise"], {
        segmentCount: 2,
      }),
    ).toBe("1.2(a)");
    expect(inferPgaFormatFromLeads(["no labels here"])).toBeNull();
  });

  it("does not treat booklet '3.1 (a)' spaced-paren leads as PGA", () => {
    expect(
      inferPgaFormatFromLeads(
        ["P 3.1 (a) visa", "P 3.2", "P 4.1 (a) beräkna"],
        { prefix: "P", segmentCount: 2 },
      ),
    ).toBeNull();
  });
});

describe("enrichFormatWithInferredPga", () => {
  it("fills null pgaFormat but does not override an explicit value", () => {
    const filled = enrichFormatWithInferredPga(FORMAT_MAJOR_RESTART, [
      "1.",
      "1a) Svar",
      "2) Svar",
    ]);
    expect(filled.pgaFormat).toBe("1a)");

    const kept = enrichFormatWithInferredPga(
      { ...FORMAT_MAJOR_RESTART, pgaFormat: "2(a)" },
      ["1a) Svar"],
    );
    expect(kept.pgaFormat).toBe("2(a)");
  });
});

describe("normalizeProblemNumberFormat", () => {
  it("falls back on invalid input", () => {
    expect(normalizeProblemNumberFormat(null)).toEqual(
      FALLBACK_PROBLEM_NUMBER_FORMAT,
    );
  });

  it("trims empty strings to null", () => {
    const normalized = normalizeProblemNumberFormat({
      prefix: "  ",
      segmentCount: 2,
      requireTerminator: false,
      pgaFormat: "",
      titleBlocks: "never",
      answerSectionHeading: "  Facit  ",
      allowNumberRestart: true,
      examples: [" 1.1 ", ""],
    });
    expect(normalized.prefix).toBeNull();
    expect(normalized.pgaFormat).toBeNull();
    expect(normalized.answerSectionHeading).toBe("Facit");
    expect(normalized.examples).toEqual(["1.1"]);
  });
});
