import type { MiddleBlock, MiddleContentPart, MiddleJson } from "./mineruSchema";

export type ProblemChunk = {
  problemNumber: string;
  problemText: string;
  answerText: string;
};

/** Classic booklet: "P 1.2" / "P1.2" near the start of a line. */
const PROBLEM_P_RE = /\bP\s*(\d+\.\d+)\b/i;
/** "Uppgift 3" / "Uppg. 3". */
const PROBLEM_UPPGIFT_RE = /^\s*(?:Uppgift|Uppg\.?)\s+(\d+)\b/i;
/** Booklet without P: "1.2 " at line start. */
const PROBLEM_DOTTED_RE = /^\s*(\d+\.\d+)\b/;
/**
 * Exam-style major number: "1. (a)", "2.", "3) text".
 * Requires "." or ")" after the digits so dates/ranges don't match.
 */
const PROBLEM_MAJOR_RE = /^\s*(\d+)\s*[.)](?:\s|\(|$)/;

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
 * Detect a problem number at the start of a flattened line.
 * Prefers P x.y / dotted x.y; otherwise exam-style major "N." / "Uppgift N".
 * Preamble and (a)/(b) continuation lines return null.
 */
export function matchProblemStart(line: string): string | null {
  const pMatch = line.match(PROBLEM_P_RE);
  if (pMatch !== null && pMatch.index !== undefined && pMatch.index < 8) {
    return pMatch[1]!;
  }

  const uppgiftMatch = line.match(PROBLEM_UPPGIFT_RE);
  if (uppgiftMatch !== null) {
    return uppgiftMatch[1]!;
  }

  const dottedMatch = line.match(PROBLEM_DOTTED_RE);
  if (dottedMatch !== null) {
    return dottedMatch[1]!;
  }

  const majorMatch = line.match(PROBLEM_MAJOR_RE);
  if (majorMatch !== null) {
    return majorMatch[1]!;
  }

  return null;
}

/**
 * Flatten all middle_json page blocks into ordered plain text
 * (for general-info parse). Skips page numbers and footers only.
 */
export function flattenFullDocument(middleJson: MiddleJson): string {
  const lines: string[] = [];

  for (const page of middleJson.pages) {
    for (const block of page.blocks) {
      const type = block.type;
      if (type === "page_number" || type === "footer") {
        continue;
      }
      const text = blockToText(block).replace(/\s+/g, " ").trim();
      if (text.length === 0) {
        continue;
      }
      lines.push(text);
    }
  }

  return lines.join("\n");
}

/**
 * Flatten middle_json pages into ordered plain-text lines, tagged by section.
 * When the PDF has no "problem"/"svar" headers (typical tentor), falls back to
 * the full document as problem lines so exam-style numbering can still split.
 */
export function flattenMiddleJson(middleJson: MiddleJson): {
  problemLines: string[];
  answerLines: string[];
} {
  const problemLines: string[] = [];
  const answerLines: string[] = [];
  const allLines: string[] = [];
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
        // Skip section headers; other titles still go into the exam fallback.
        if (section === "unknown") {
          allLines.push(text);
        }
        continue;
      }

      if (type === "page_number" || type === "footer") {
        continue;
      }

      allLines.push(text);

      if (section === "problem") {
        problemLines.push(text);
      } else if (section === "answer") {
        answerLines.push(text);
      }
    }
  }

  if (problemLines.length === 0 && answerLines.length === 0) {
    return { problemLines: allLines, answerLines: [] };
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
    const number = matchProblemStart(line);
    if (number !== null) {
      flush();
      currentNumber = number;
      currentParts = [line];
      continue;
    }
    // Preamble before the first problem number is ignored.
    if (currentNumber !== null) {
      currentParts.push(line);
    }
  }
  flush();

  return map;
}

function compareProblemNumbers(a: string, b: string): number {
  const [aMajor, aMinor = 0] = a.split(".").map(Number);
  const [bMajor, bMinor = 0] = b.split(".").map(Number);
  if (aMajor !== bMajor) {
    return (aMajor ?? 0) - (bMajor ?? 0);
  }
  return (aMinor ?? 0) - (bMinor ?? 0);
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

  const numbers = [...problems.keys()].sort(compareProblemNumbers);

  return numbers.map((problemNumber) => ({
    problemNumber,
    problemText: problems.get(problemNumber) ?? "",
    answerText: answers.get(problemNumber) ?? "",
  }));
}
