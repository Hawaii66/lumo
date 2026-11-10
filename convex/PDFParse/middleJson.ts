import type { MiddleBlock, MiddleContentPart, MiddleJson } from "./mineruSchema";

/** One flattened middle_json text line with its 0-based PDF page. */
export type MiddleJsonLine = {
  text: string;
  pageIdx: number;
};

export type ProblemChunk = {
  problemNumber: string;
  problemText: string;
  answerText: string;
  /** First page (0-based) where this problem's stem appears. */
  sourceQuestionPageIdx?: number;
  /** First page (0-based) where this problem's answer appears. */
  sourceAnswerPageIdx?: number;
};

type SplitProblem = {
  text: string;
  sourcePageIdx: number;
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

/**
 * PGA-style answer labels with parenthesized letter: "2(a)", "2 (a)", "1.2(a)".
 * Answer-side only — not used for question stems.
 */
const ANSWER_PGA_PAREN_RE = /^\s*(\d+(?:\.\d+)?)\s*\(([a-z])\)/i;
/**
 * PGA glued letter: "2a", "2a)", "2a.", "1.2a".
 * No space between number and letter so "1.2 foo" is not treated as letter f.
 */
const ANSWER_PGA_GLUED_RE =
  /^\s*(\d+(?:\.\d+)?)([a-z])(?:\s*[.)])?(?=\s|$)/i;
/**
 * PGA spaced letter only when punctuation follows: "2 a)", "2 a.", "1.2 a)".
 */
const ANSWER_PGA_SPACED_RE =
  /^\s*(\d+(?:\.\d+)?)\s+([a-z])\s*[.)](?=\s|$)/i;

const SECTION_PROBLEM_RE = /^\s*problem\s*$/i;
const SECTION_ANSWER_RE = /^\s*svar\s*$/i;

/** Final facit marker inside a worked solution ("Svar: …"). */
const INLINE_SVAR_RE = /\bSvar\s*[:.]/i;

/**
 * Line-oriented cues that usually open a worked solution (not the stem).
 * Only applied when the same chunk also contains an inline "Svar:".
 */
const SOLUTION_START_RE =
  /(?:^|\n)\s*(?:Lösning\s*[:.]|Lösn\s*[:.]|För att\b|Vi (?:har|söker|börjar|noterar|finner|får|ska)\b|Notera\b|Eftersom\b|Dessutom måste\b|Antag(?:er)? att\b|Beräkning\s*[:.])/i;

/** Softer fallback when OCR flattened the solution opener mid-line. */
const LOOSE_SOLUTION_START_RE =
  /\b(?:Lösning\s*[:.]|För att\b|Vi har\b|Eftersom\b|Notera att\b|Dessutom måste\b)/i;

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

export type AnswerStartMatch = {
  problemNumber: string;
  subproblemLetter: string | null;
};

/**
 * Detect an answer-section problem start, including PGA labels like "2a" / "2(a)".
 * Tries PGA forms before ordinary matchProblemStart so "1.2(a)" keeps letter a.
 */
export function matchAnswerStart(line: string): AnswerStartMatch | null {
  const parenMatch = ANSWER_PGA_PAREN_RE.exec(line);
  if (parenMatch !== null) {
    return {
      problemNumber: parenMatch[1]!,
      subproblemLetter: parenMatch[2]!.toLowerCase(),
    };
  }

  const gluedMatch = ANSWER_PGA_GLUED_RE.exec(line);
  if (gluedMatch !== null) {
    return {
      problemNumber: gluedMatch[1]!,
      subproblemLetter: gluedMatch[2]!.toLowerCase(),
    };
  }

  const spacedMatch = ANSWER_PGA_SPACED_RE.exec(line);
  if (spacedMatch !== null) {
    return {
      problemNumber: spacedMatch[1]!,
      subproblemLetter: spacedMatch[2]!.toLowerCase(),
    };
  }

  const problemNumber = matchProblemStart(line);
  if (problemNumber !== null) {
    return { problemNumber, subproblemLetter: null };
  }

  return null;
}

/** Rewrite "2a) …" / "2(a) …" to "(a) …" so the convert prompt sees subproblem markers. */
function rewritePgaAnswerLine(line: string, letter: string): string {
  const prefix =
    ANSWER_PGA_PAREN_RE.exec(line) ??
    ANSWER_PGA_GLUED_RE.exec(line) ??
    ANSWER_PGA_SPACED_RE.exec(line);
  const rest =
    prefix !== null
      ? line.slice(prefix[0].length).trimStart()
      : line.trimStart();
  return rest.length > 0 ? `(${letter}) ${rest}` : `(${letter})`;
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
 * Each line keeps its 0-based page index (MinerU page_idx, else array index).
 */
export function flattenMiddleJson(middleJson: MiddleJson): {
  problemLines: MiddleJsonLine[];
  answerLines: MiddleJsonLine[];
} {
  const problemLines: MiddleJsonLine[] = [];
  const answerLines: MiddleJsonLine[] = [];
  const allLines: MiddleJsonLine[] = [];
  let section: "problem" | "answer" | "unknown" = "unknown";

  for (let pageIndex = 0; pageIndex < middleJson.pages.length; pageIndex++) {
    const page = middleJson.pages[pageIndex]!;
    const pageIdx = page.page_idx ?? pageIndex;
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
          allLines.push({ text, pageIdx });
        }
        continue;
      }

      if (type === "page_number" || type === "footer") {
        continue;
      }

      const line = { text, pageIdx };
      allLines.push(line);

      if (section === "problem") {
        problemLines.push(line);
      } else if (section === "answer") {
        answerLines.push(line);
      }
    }
  }

  if (problemLines.length === 0 && answerLines.length === 0) {
    return { problemLines: allLines, answerLines: [] };
  }

  return { problemLines, answerLines };
}

function splitByProblemNumber(lines: MiddleJsonLine[]): Map<string, SplitProblem> {
  const map = new Map<string, SplitProblem>();
  let currentNumber: string | null = null;
  let currentParts: string[] = [];
  let currentPageIdx: number | null = null;

  const flush = () => {
    if (currentNumber === null || currentPageIdx === null) {
      return;
    }
    const text = currentParts.join("\n").trim();
    if (text.length === 0) {
      return;
    }
    const existing = map.get(currentNumber);
    map.set(
      currentNumber,
      existing === undefined
        ? { text, sourcePageIdx: currentPageIdx }
        : {
            text: `${existing.text}\n${text}`,
            sourcePageIdx: existing.sourcePageIdx,
          },
    );
  };

  for (const line of lines) {
    const number = matchProblemStart(line.text);
    if (number !== null) {
      flush();
      currentNumber = number;
      currentParts = [line.text];
      currentPageIdx = line.pageIdx;
      continue;
    }
    // Preamble before the first problem number is ignored.
    if (currentNumber !== null) {
      currentParts.push(line.text);
    }
  }
  flush();

  return map;
}

/**
 * Split answer lines by base problem number.
 * PGA labels (2a/2b/2c) group under "2" and are rewritten to (a)/(b)/(c) leads.
 * Keeps the first page index for each problem number.
 */
function splitAnswersByProblemNumber(
  lines: MiddleJsonLine[],
): Map<string, SplitProblem> {
  const map = new Map<string, SplitProblem>();
  let currentNumber: string | null = null;
  let currentParts: string[] = [];
  let currentPageIdx: number | null = null;

  const flush = () => {
    if (currentNumber === null || currentPageIdx === null) {
      return;
    }
    const text = currentParts.join("\n").trim();
    if (text.length === 0) {
      return;
    }
    const existing = map.get(currentNumber);
    map.set(
      currentNumber,
      existing === undefined
        ? { text, sourcePageIdx: currentPageIdx }
        : {
            text: `${existing.text}\n${text}`,
            sourcePageIdx: existing.sourcePageIdx,
          },
    );
  };

  for (const line of lines) {
    const match = matchAnswerStart(line.text);
    if (match !== null) {
      flush();
      currentNumber = match.problemNumber;
      currentParts = [
        match.subproblemLetter !== null
          ? rewritePgaAnswerLine(line.text, match.subproblemLetter)
          : line.text,
      ];
      currentPageIdx = line.pageIdx;
      continue;
    }
    // Preamble before the first answer number is ignored.
    if (currentNumber !== null) {
      currentParts.push(line.text);
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

/** Optional leading "7." / "1.2" / "P 1.2" before stem or solution prose. */
const LEADING_NUMBER_RE = /^\s*(?:P\s*)?(?:\d+\.\d+|\d+)\s*[.)]?\s*/i;

/** Solution opener at the very start of a line/body (no stem before it). */
const SOLUTION_AT_START_RE =
  /^(?:Lösning\s*[:.]|Lösn\s*[:.]|För att\b|Vi (?:har|söker|börjar|noterar|finner|får|ska)\b|Notera\b|Eftersom\b|Dessutom måste\b|Antag(?:er)? att\b|Beräkning\s*[:.])/i;

/**
 * Cut worked-solution prose off a stem, keeping only the problem statement.
 * Returns "" when the blob is solution-only (no stem before the opener).
 */
function cutSolutionFromStem(beforeSvar: string): string {
  const prefixMatch = LEADING_NUMBER_RE.exec(beforeSvar);
  const bodyOffset = prefixMatch?.[0]?.length ?? 0;
  const body = beforeSvar.slice(bodyOffset);

  // Facit-only chunk: "7. För att …" / "Lösning: …" with no stem.
  if (SOLUTION_AT_START_RE.test(body)) {
    return "";
  }

  const anchored = SOLUTION_START_RE.exec(beforeSvar);
  if (
    anchored !== null &&
    anchored.index !== undefined &&
    anchored.index > 0
  ) {
    return beforeSvar.slice(0, anchored.index).trim();
  }

  // OCR sometimes joins the stem and "För att …" on one line.
  const loose = LOOSE_SOLUTION_START_RE.exec(beforeSvar);
  if (
    loose !== null &&
    loose.index !== undefined &&
    loose.index >= bodyOffset + 8
  ) {
    return beforeSvar.slice(0, loose.index).trim();
  }

  // No clear opener: keep text before "Svar:" and let the convert prompt
  // strip residual solution prose if the stem is still mixed.
  return beforeSvar.trim();
}

/**
 * When a chunk mixes stem + worked solution + "Svar:", peel them apart.
 * Solution narrative is discarded; only stem and final facit remain.
 *
 * Also peels "Svar:" out of answer-section blobs that are full solutions.
 */
export function separateStemAndFacit(
  problemText: string,
  answerText: string,
): { problemText: string; answerText: string } {
  let stem = problemText;
  let facit = answerText;

  const problemSvar = INLINE_SVAR_RE.exec(problemText);
  if (problemSvar !== null && problemSvar.index !== undefined) {
    const before = problemText.slice(0, problemSvar.index);
    const after = problemText
      .slice(problemSvar.index + problemSvar[0].length)
      .trim();
    stem = cutSolutionFromStem(before);
    if (facit.trim().length === 0) {
      facit = after;
    }
  }

  const answerSvar = INLINE_SVAR_RE.exec(facit);
  if (answerSvar !== null && answerSvar.index !== undefined) {
    facit = facit.slice(answerSvar.index + answerSvar[0].length).trim();
  }

  return { problemText: stem.trim(), answerText: facit.trim() };
}

/**
 * Split flattened problem/answer text into one chunk per problem number.
 * Problems without answers still appear (answerText empty).
 * Answers without a matching problem are omitted.
 * Worked-solution narrative mixed into a chunk is stripped via separateStemAndFacit.
 */
export function splitIntoProblemChunks(
  problemLines: MiddleJsonLine[],
  answerLines: MiddleJsonLine[],
): ProblemChunk[] {
  const problems = splitByProblemNumber(problemLines);
  const answers = splitAnswersByProblemNumber(answerLines);

  const numbers = [...problems.keys()].sort(compareProblemNumbers);

  return numbers.map((problemNumber) => {
    const problem = problems.get(problemNumber);
    const answer = answers.get(problemNumber);
    const separated = separateStemAndFacit(
      problem?.text ?? "",
      answer?.text ?? "",
    );
    return {
      problemNumber,
      problemText: separated.problemText,
      answerText: separated.answerText,
      ...(problem !== undefined
        ? { sourceQuestionPageIdx: problem.sourcePageIdx }
        : {}),
      ...(answer !== undefined
        ? { sourceAnswerPageIdx: answer.sourcePageIdx }
        : {}),
    };
  });
}
