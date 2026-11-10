import { normalizeMineruImagePath } from "./mineruClient";
import type { MiddleBlock, MiddleContentPart, MiddleJson } from "./mineruSchema";

export type FlattenToken =
  | { kind: "text"; text: string; pageIdx: number }
  | { kind: "image"; path: string; pageIdx: number };

/** Image path + optional deluppgift letter (`""` = shared stem). */
export type ChunkImageRef = {
  path: string;
  subproblemLetter: string;
};

export type ProblemChunk = {
  problemNumber: string;
  problemText: string;
  answerText: string;
  questionImages: ChunkImageRef[];
  answerImages: ChunkImageRef[];
  /** First page (0-based) where this problem's stem appears. */
  sourceQuestionPageIdx?: number;
  /** First page (0-based) where this problem's answer appears. */
  sourceAnswerPageIdx?: number;
};

type ChunkParts = {
  text: string;
  images: ChunkImageRef[];
  sourcePageIdx: number;
};

/**
 * Detect a deluppgift letter at the start of an OCR/markdown line.
 * Matches `(a)`, `### (a)`, `a)`, `a.`.
 */
export function matchSubproblemLetter(line: string): string | null {
  const trimmed = line.trim();
  const heading = trimmed.match(/^#{2,4}\s*\(([a-z])\)\s*$/i);
  if (heading !== null) {
    return heading[1]!.toLowerCase();
  }
  const paren = trimmed.match(/^\(([a-z])\)(?:\s|$)/i);
  if (paren !== null) {
    return paren[1]!.toLowerCase();
  }
  const glued = trimmed.match(/^([a-z])\s*[.)](?:\s|$)/i);
  if (glued !== null) {
    return glued[1]!.toLowerCase();
  }
  return null;
}

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

/** Top-level MinerU blocks that are real figures (not equation screenshots). */
const VISUAL_FIGURE_BLOCK_TYPES = new Set([
  "image",
  "table",
  "chart",
  "image_body",
  "table_body",
  "chart_body",
]);

/** Collect image_path / img_path values anywhere under a middle_json block. */
function collectImagePaths(value: unknown, out: string[]): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectImagePaths(item, out);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }

  const obj = value as Record<string, unknown>;
  const rawPath = obj.image_path ?? obj.img_path;
  if (typeof rawPath === "string" && rawPath.trim().length > 0) {
    const path = normalizeMineruImagePath(rawPath.trim());
    // Skip MinerU equation crops even if nested under a visual container.
    if (!/_equation(?:_|\.|$)/i.test(path) && !/\/equation\./i.test(path)) {
      out.push(path);
    }
  }
  for (const child of Object.values(obj)) {
    collectImagePaths(child, out);
  }
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    result.push(path);
  }
  return result;
}

function isVisualFigureBlock(block: MiddleBlock): boolean {
  const type = (block.type ?? "").toLowerCase();
  if (type.includes("equation")) {
    return false;
  }
  return VISUAL_FIGURE_BLOCK_TYPES.has(type);
}

function blockToTokens(block: MiddleBlock, pageIdx: number): FlattenToken[] {
  const text = blockToText(block).replace(/\s+/g, " ").trim();
  const tokens: FlattenToken[] = [];
  if (text.length > 0) {
    tokens.push({ kind: "text", text, pageIdx });
  }

  // Only figure/table/chart blocks become problem images — not equation crops.
  if (isVisualFigureBlock(block)) {
    const found: string[] = [];
    collectImagePaths(block, found);
    for (const path of uniquePaths(found)) {
      tokens.push({ kind: "image", path, pageIdx });
    }
  }
  return tokens;
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
 * Flatten middle_json pages into ordered text/image tokens, tagged by section.
 * When the PDF has no "problem"/"svar" headers (typical tentor), falls back to
 * the full document as problem tokens so exam-style numbering can still split.
 * Each token keeps its 0-based page index (MinerU page_idx, else array index).
 */
export function flattenMiddleJson(middleJson: MiddleJson): {
  problemTokens: FlattenToken[];
  answerTokens: FlattenToken[];
} {
  const problemTokens: FlattenToken[] = [];
  const answerTokens: FlattenToken[] = [];
  const allTokens: FlattenToken[] = [];
  let section: "problem" | "answer" | "unknown" = "unknown";

  for (let pageIndex = 0; pageIndex < middleJson.pages.length; pageIndex++) {
    const page = middleJson.pages[pageIndex]!;
    const pageIdx = page.page_idx ?? pageIndex;
    for (const block of page.blocks) {
      const type = block.type;
      const tokens = blockToTokens(block, pageIdx);
      const textToken = tokens.find((token) => token.kind === "text");

      if (type === "paragraph_title" || type === "header") {
        if (textToken !== undefined) {
          if (SECTION_PROBLEM_RE.test(textToken.text)) {
            section = "problem";
          } else if (SECTION_ANSWER_RE.test(textToken.text)) {
            section = "answer";
          }
        }
        // Skip section headers; other titles still go into the exam fallback.
        if (section === "unknown") {
          allTokens.push(...tokens);
        }
        continue;
      }

      if (type === "page_number" || type === "footer") {
        continue;
      }

      if (tokens.length === 0) {
        continue;
      }

      allTokens.push(...tokens);

      if (section === "problem") {
        problemTokens.push(...tokens);
      } else if (section === "answer") {
        answerTokens.push(...tokens);
      }
    }
  }

  if (problemTokens.length === 0 && answerTokens.length === 0) {
    return { problemTokens: allTokens, answerTokens: [] };
  }

  return { problemTokens, answerTokens };
}

function appendImage(
  images: ChunkImageRef[],
  path: string,
  subproblemLetter: string,
): void {
  if (
    images.some(
      (image) =>
        image.path === path && image.subproblemLetter === subproblemLetter,
    )
  ) {
    return;
  }
  images.push({ path, subproblemLetter });
}

function flushChunkParts(
  map: Map<string, ChunkParts>,
  currentNumber: string | null,
  textParts: string[],
  images: ChunkImageRef[],
  sourcePageIdx: number | null,
): void {
  if (currentNumber === null || sourcePageIdx === null) {
    return;
  }
  const text = textParts.join("\n").trim();
  if (text.length === 0 && images.length === 0) {
    return;
  }
  const existing = map.get(currentNumber);
  if (existing === undefined) {
    map.set(currentNumber, {
      text,
      images: [...images],
      sourcePageIdx,
    });
    return;
  }
  const mergedText =
    existing.text.length === 0
      ? text
      : text.length === 0
        ? existing.text
        : `${existing.text}\n${text}`;
  const mergedImages = [...existing.images];
  for (const image of images) {
    appendImage(mergedImages, image.path, image.subproblemLetter);
  }
  map.set(currentNumber, {
    text: mergedText,
    images: mergedImages,
    sourcePageIdx: existing.sourcePageIdx,
  });
}

function splitByProblemNumber(tokens: FlattenToken[]): Map<string, ChunkParts> {
  const map = new Map<string, ChunkParts>();
  let currentNumber: string | null = null;
  let currentParts: string[] = [];
  let currentImages: ChunkImageRef[] = [];
  let currentPageIdx: number | null = null;
  let currentSubLetter = "";

  for (const token of tokens) {
    if (token.kind === "image") {
      if (currentNumber !== null) {
        appendImage(currentImages, token.path, currentSubLetter);
      }
      continue;
    }

    const number = matchProblemStart(token.text);
    if (number !== null) {
      flushChunkParts(
        map,
        currentNumber,
        currentParts,
        currentImages,
        currentPageIdx,
      );
      currentNumber = number;
      currentParts = [token.text];
      currentImages = [];
      currentPageIdx = token.pageIdx;
      currentSubLetter = matchSubproblemLetter(token.text) ?? "";
      continue;
    }
    // Preamble before the first problem number is ignored.
    if (currentNumber !== null) {
      const letter = matchSubproblemLetter(token.text);
      if (letter !== null) {
        currentSubLetter = letter;
      }
      currentParts.push(token.text);
    }
  }
  flushChunkParts(
    map,
    currentNumber,
    currentParts,
    currentImages,
    currentPageIdx,
  );

  return map;
}

/**
 * Split answer tokens by base problem number.
 * PGA labels (2a/2b/2c) group under "2" and are rewritten to (a)/(b)/(c) leads.
 * Keeps the first page index for each problem number.
 */
function splitAnswersByProblemNumber(
  tokens: FlattenToken[],
): Map<string, ChunkParts> {
  const map = new Map<string, ChunkParts>();
  let currentNumber: string | null = null;
  let currentParts: string[] = [];
  let currentImages: ChunkImageRef[] = [];
  let currentPageIdx: number | null = null;
  let currentSubLetter = "";

  for (const token of tokens) {
    if (token.kind === "image") {
      if (currentNumber !== null) {
        appendImage(currentImages, token.path, currentSubLetter);
      }
      continue;
    }

    const match = matchAnswerStart(token.text);
    if (match !== null) {
      flushChunkParts(
        map,
        currentNumber,
        currentParts,
        currentImages,
        currentPageIdx,
      );
      currentNumber = match.problemNumber;
      currentSubLetter = match.subproblemLetter ?? "";
      const line =
        match.subproblemLetter !== null
          ? rewritePgaAnswerLine(token.text, match.subproblemLetter)
          : token.text;
      currentParts = [line];
      currentImages = [];
      currentPageIdx = token.pageIdx;
      if (currentSubLetter.length === 0) {
        currentSubLetter = matchSubproblemLetter(line) ?? "";
      }
      continue;
    }
    // Preamble before the first answer number is ignored.
    if (currentNumber !== null) {
      const letter = matchSubproblemLetter(token.text);
      if (letter !== null) {
        currentSubLetter = letter;
      }
      currentParts.push(token.text);
    }
  }
  flushChunkParts(
    map,
    currentNumber,
    currentParts,
    currentImages,
    currentPageIdx,
  );

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
 * Split flattened problem/answer tokens into one chunk per problem number.
 * Problems without answers still appear (answerText empty).
 * Answers without a matching problem are omitted.
 * Worked-solution narrative mixed into a chunk is stripped via separateStemAndFacit.
 * Image paths and first source page indices stay with each reading-order window.
 */
export function splitIntoProblemChunks(
  problemTokens: FlattenToken[],
  answerTokens: FlattenToken[],
): ProblemChunk[] {
  const problems = splitByProblemNumber(problemTokens);
  const answers = splitAnswersByProblemNumber(answerTokens);

  const numbers = [...problems.keys()].sort(compareProblemNumbers);

  return numbers.map((problemNumber) => {
    const problemParts = problems.get(problemNumber);
    const answerParts = answers.get(problemNumber);
    const separated = separateStemAndFacit(
      problemParts?.text ?? "",
      answerParts?.text ?? "",
    );
    return {
      problemNumber,
      problemText: separated.problemText,
      answerText: separated.answerText,
      questionImages: problemParts?.images ?? [],
      answerImages: answerParts?.images ?? [],
      ...(problemParts !== undefined
        ? { sourceQuestionPageIdx: problemParts.sourcePageIdx }
        : {}),
      ...(answerParts !== undefined
        ? { sourceAnswerPageIdx: answerParts.sourcePageIdx }
        : {}),
    };
  });
}
