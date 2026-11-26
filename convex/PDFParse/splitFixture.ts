import type { ProblemChunk } from "./middleJson";

/** Stable chunk shape for dry-run expected.json files. */
export type NormalizedSplitChunk = {
  problemNumber: string;
  problemText: string;
  answerText: string;
  questionImages: Array<{ path: string; subproblemLetter: string }>;
  answerImages: Array<{ path: string; subproblemLetter: string }>;
  sourceQuestionPageIdx?: number;
  sourceAnswerPageIdx?: number;
};

function sortImages(
  images: Array<{ path: string; subproblemLetter: string }>,
): Array<{ path: string; subproblemLetter: string }> {
  return [...images].sort((a, b) =>
    a.path === b.path
      ? a.subproblemLetter.localeCompare(b.subproblemLetter)
      : a.path.localeCompare(b.path),
  );
}

/** Normalize a splitter chunk for fixture comparison / export. */
export function normalizeChunkForFixture(
  chunk: ProblemChunk,
): NormalizedSplitChunk {
  return {
    problemNumber: chunk.problemNumber,
    problemText: chunk.problemText,
    answerText: chunk.answerText,
    questionImages: sortImages(chunk.questionImages),
    answerImages: sortImages(chunk.answerImages),
    ...(chunk.sourceQuestionPageIdx !== undefined
      ? { sourceQuestionPageIdx: chunk.sourceQuestionPageIdx }
      : {}),
    ...(chunk.sourceAnswerPageIdx !== undefined
      ? { sourceAnswerPageIdx: chunk.sourceAnswerPageIdx }
      : {}),
  };
}

/** Turn a PDF / run name into a safe fixture directory name. */
export function suggestFixtureName(rawName: string): string {
  const base = rawName
    .replace(/\.pdf$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "split-fixture";
}
