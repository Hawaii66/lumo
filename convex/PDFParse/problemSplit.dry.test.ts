import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectProblemChunks } from "./middleJson";
import { middleJsonSchema } from "./mineruSchema";
import {
  normalizeProblemNumberFormat,
  problemNumberFormatSchema,
} from "./problemNumberFormat";
import {
  normalizeChunkForFixture,
  type NormalizedSplitChunk,
} from "./splitFixture";

const FIXTURES_ROOT = path.join(import.meta.dirname, "__fixtures__");

function imagesKey(
  images: Array<{ path: string; subproblemLetter: string }>,
): string {
  return JSON.stringify(images);
}

function diffChunkFields(
  expected: NormalizedSplitChunk,
  actual: NormalizedSplitChunk,
): string[] {
  const changed: string[] = [];
  if (expected.problemText !== actual.problemText) {
    changed.push("problemText");
  }
  if (expected.answerText !== actual.answerText) {
    changed.push("answerText");
  }
  if (imagesKey(expected.questionImages) !== imagesKey(actual.questionImages)) {
    changed.push("questionImages");
  }
  if (imagesKey(expected.answerImages) !== imagesKey(actual.answerImages)) {
    changed.push("answerImages");
  }
  if (expected.sourceQuestionPageIdx !== actual.sourceQuestionPageIdx) {
    changed.push("sourceQuestionPageIdx");
  }
  if (expected.sourceAnswerPageIdx !== actual.sourceAnswerPageIdx) {
    changed.push("sourceAnswerPageIdx");
  }
  return changed;
}

function formatPerProblemDiff(
  expected: NormalizedSplitChunk[],
  actual: NormalizedSplitChunk[],
): string {
  const expectedMap = new Map(
    expected.map((chunk) => [chunk.problemNumber, chunk]),
  );
  const actualMap = new Map(
    actual.map((chunk) => [chunk.problemNumber, chunk]),
  );
  const allNumbers = [
    ...new Set([...expectedMap.keys(), ...actualMap.keys()]),
  ].sort((a, b) => {
    const aParts = a.split(".").map(Number);
    const bParts = b.split(".").map(Number);
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i++) {
      const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
      if (diff !== 0) {
        return diff;
      }
    }
    return 0;
  });

  const lines: string[] = [];
  for (const number of allNumbers) {
    const exp = expectedMap.get(number);
    const act = actualMap.get(number);
    if (exp === undefined && act !== undefined) {
      lines.push(`+ added ${number}`);
      continue;
    }
    if (exp !== undefined && act === undefined) {
      lines.push(`- removed ${number}`);
      continue;
    }
    if (exp !== undefined && act !== undefined) {
      const changed = diffChunkFields(exp, act);
      if (changed.length > 0) {
        lines.push(`~ changed ${number}: ${changed.join(", ")}`);
      }
    }
  }

  const expectedOrder = expected.map((c) => c.problemNumber).join(",");
  const actualOrder = actual.map((c) => c.problemNumber).join(",");
  if (lines.length === 0) {
    if (expectedOrder !== actualOrder) {
      return `chunk order differs\n  expected: ${expectedOrder}\n  actual:   ${actualOrder}`;
    }
    return "(no semantic per-problem diffs — check key order / serialization)";
  }
  return lines.join("\n");
}

/** Rebuild with stable field order (Convex HTTP JSON may alphabetize keys). */
function canonicalizeChunk(chunk: NormalizedSplitChunk): NormalizedSplitChunk {
  return normalizeChunkForFixture({
    problemNumber: chunk.problemNumber,
    problemText: chunk.problemText,
    answerText: chunk.answerText,
    questionImages: chunk.questionImages ?? [],
    answerImages: chunk.answerImages ?? [],
    ...(chunk.sourceQuestionPageIdx !== undefined
      ? { sourceQuestionPageIdx: chunk.sourceQuestionPageIdx }
      : {}),
    ...(chunk.sourceAnswerPageIdx !== undefined
      ? { sourceAnswerPageIdx: chunk.sourceAnswerPageIdx }
      : {}),
  });
}

function listFixtureDirs(): string[] {
  if (!fs.existsSync(FIXTURES_ROOT)) {
    return [];
  }
  return fs
    .readdirSync(FIXTURES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe("problem split dry-run fixtures", () => {
  const fixtures = listFixtureDirs();
  expect(fixtures.length).toBeGreaterThan(0);

  for (const name of fixtures) {
    it(`${name}: middle.json + format.json → expected chunks`, () => {
      const dir = path.join(FIXTURES_ROOT, name);
      const middleRaw = JSON.parse(
        fs.readFileSync(path.join(dir, "middle.json"), "utf8"),
      ) as unknown;
      const formatRaw = JSON.parse(
        fs.readFileSync(path.join(dir, "format.json"), "utf8"),
      ) as unknown;
      const expectedRaw = JSON.parse(
        fs.readFileSync(path.join(dir, "expected.json"), "utf8"),
      ) as unknown;

      const middle = middleJsonSchema.parse(middleRaw);
      const format = normalizeProblemNumberFormat(
        problemNumberFormatSchema.parse(formatRaw),
      );
      expect(Array.isArray(expectedRaw)).toBe(true);

      const actual = detectProblemChunks(middle, format).map(
        normalizeChunkForFixture,
      );
      const expected = (expectedRaw as NormalizedSplitChunk[]).map(
        canonicalizeChunk,
      );

      try {
        expect(actual).toEqual(expected);
      } catch (err) {
        const perProblem = formatPerProblemDiff(expected, actual);
        throw new Error(
          `Split dry-run mismatch for fixture "${name}".\n` +
            `Per-problem changes:\n${perProblem}\n` +
            `expected ${expected.length} chunks, got ${actual.length}\n` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    });
  }
});
