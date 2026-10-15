import type { MiddleBlock, MiddleContentPart, MiddleJson } from "./mineruSchema";

export type ProblemChunk = {
  problemNumber: string;
  problemText: string;
  answerText: string;
};

const PROBLEM_NUMBER_RE = /\bP\s*(\d+\.\d+)\b/i;
const SECTION_PROBLEM_RE = /^\s*problem\s*$/i;
const SECTION_ANSWER_RE = /^\s*svar\s*$/i;

function partToText(part: string | MiddleContentPart | undefined): string {
  if (part === undefined) {
    return "";
  }
  if (typeof part === "string") {
    return part;
  }
  if (typeof part.content === "string") {
    return part.content;
  }
  if (Array.isArray(part.content)) {
    return part.content.map(partToText).join("");
  }
  return "";
}

function blockToText(block: MiddleBlock): string {
  if (typeof block.content === "string") {
    return block.content;
  }
  if (Array.isArray(block.content)) {
    return block.content.map(partToText).join("");
  }
  return "";
}

/**
 * Flatten middle_json pages into ordered plain-text lines, tagged by section.
 */
export function flattenMiddleJson(middleJson: MiddleJson): {
  problemLines: string[];
  answerLines: string[];
} {
  const problemLines: string[] = [];
  const answerLines: string[] = [];
  let section: "problem" | "answer" | "unknown" = "unknown";

  for (const page of middleJson.pages) {
    for (const block of page.blocks) {
      const text = blockToText(block).replace(/\s+/g, " ").trim();
      if (text.length === 0) {
        continue;
      }

      const type = block.type;
      if (type === "paragraph_title" || type === "header") {
        if (SECTION_PROBLEM_RE.test(text)) {
          section = "problem";
        } else if (SECTION_ANSWER_RE.test(text)) {
          section = "answer";
        }
        // Skip section headers and chapter titles; problems are keyed by P x.y.
        continue;
      }

      if (type === "page_number" || type === "footer") {
        continue;
      }

      if (section === "problem") {
        problemLines.push(text);
      } else if (section === "answer") {
        answerLines.push(text);
      }
    }
  }

  return { problemLines, answerLines };
}

function splitByProblemNumber(lines: string[]): Map<string, string> {
  const map = new Map<string, string>();
  let currentNumber: string | null = null;
  let currentParts: string[] = [];

  const flush = () => {
    if (currentNumber === null) {
      return;
    }
    const text = currentParts.join("\n").trim();
    if (text.length === 0) {
      return;
    }
    const existing = map.get(currentNumber);
    map.set(
      currentNumber,
      existing === undefined ? text : `${existing}\n${text}`,
    );
  };

  for (const line of lines) {
    const match = line.match(PROBLEM_NUMBER_RE);
    if (match !== null && match.index !== undefined && match.index < 8) {
      flush();
      currentNumber = match[1]!;
      currentParts = [line];
      continue;
    }
    if (currentNumber !== null) {
      currentParts.push(line);
    }
  }
  flush();

  return map;
}

/**
 * Split flattened problem/answer text into one chunk per problem number.
 * Problems without answers still appear (answerText empty).
 * Answers without a matching problem are omitted.
 */
export function splitIntoProblemChunks(
  problemLines: string[],
  answerLines: string[],
): ProblemChunk[] {
  const problems = splitByProblemNumber(problemLines);
  const answers = splitByProblemNumber(answerLines);

  const numbers = [...problems.keys()].sort((a, b) => {
    const [aMajor, aMinor] = a.split(".").map(Number);
    const [bMajor, bMinor] = b.split(".").map(Number);
    if (aMajor !== bMajor) {
      return (aMajor ?? 0) - (bMajor ?? 0);
    }
    return (aMinor ?? 0) - (bMinor ?? 0);
  });

  return numbers.map((problemNumber) => ({
    problemNumber,
    problemText: problems.get(problemNumber) ?? "",
    answerText: answers.get(problemNumber) ?? "",
  }));
}
