/** Match ### (a) / ## (b) style deluppgift headings (letter alone in the title). */
const SUBPROBLEM_HEADING_RE = /^(#{2,4})\s*\(([a-z])\)\s*$/i;

export function normalizeSubproblemLetter(
  letter: string | undefined | null,
): string | null {
  if (letter === undefined || letter === null) return null;
  const normalized = letter.trim().toLowerCase();
  if (!/^[a-z]$/.test(normalized)) return null;
  return normalized;
}

function listSubproblemHeadingLines(
  markdown: string,
): Array<{ letter: string; lineIndex: number }> {
  const headings: Array<{ letter: string; lineIndex: number }> = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.trim().match(SUBPROBLEM_HEADING_RE);
    if (match) {
      headings.push({ letter: match[2]!.toLowerCase(), lineIndex: i });
    }
  }
  return headings;
}

export function hasSubproblemHeadings(markdown: string): boolean {
  return listSubproblemHeadingLines(markdown).length > 0;
}

/**
 * Stem (shared intro before the first ### (x)) + the block for `letter`,
 * through the line before the next deluppgift heading.
 * Returns null when the letter heading is missing.
 */
export function sliceSubproblemMarkdown(
  markdown: string,
  letter: string,
): string | null {
  const normalized = normalizeSubproblemLetter(letter);
  if (normalized === null) return null;

  const lines = markdown.split("\n");
  const headings = listSubproblemHeadingLines(markdown);
  if (headings.length === 0) return null;

  const targetIdx = headings.findIndex((h) => h.letter === normalized);
  if (targetIdx === -1) return null;

  const startLine = headings[targetIdx]!.lineIndex;
  const endLine =
    targetIdx + 1 < headings.length
      ? headings[targetIdx + 1]!.lineIndex
      : lines.length;

  const stemEnd = headings[0]!.lineIndex;
  const stem = lines.slice(0, stemEnd).join("\n").trimEnd();
  const part = lines.slice(startLine, endLine).join("\n").trimEnd();

  if (stem.length === 0) return part;
  if (part.length === 0) return stem;
  return `${stem}\n\n${part}`;
}

/**
 * Slice question (required letter) and matching answer.
 * If answer has no deluppgift headings, keep the full answer (shared facit).
 * If answer is structured but missing the letter, answer becomes "".
 */
export function sliceProblemTexts(
  questionText: string,
  answerText: string,
  letter: string,
): { questionText: string; answerText: string } | null {
  const question = sliceSubproblemMarkdown(questionText, letter);
  if (question === null) return null;

  const slicedAnswer = sliceSubproblemMarkdown(answerText, letter);
  let answer: string;
  if (slicedAnswer !== null) {
    answer = slicedAnswer;
  } else if (!hasSubproblemHeadings(answerText)) {
    answer = answerText;
  } else {
    answer = "";
  }

  return { questionText: question, answerText: answer };
}
