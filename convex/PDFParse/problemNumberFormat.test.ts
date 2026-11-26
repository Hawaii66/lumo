import { describe, expect, it } from "vitest";
import {
  FALLBACK_PROBLEM_NUMBER_FORMAT,
  normalizeProblemNumberFormat,
  parsePgaFormat,
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
