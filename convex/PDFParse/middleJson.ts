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

type LabelMatch = {
  problemNumber: string;
  subproblemLetter: string | null;
  /** True when the label itself was a PGA form (1a / 2(a)). */
  fromPga: boolean;
};

type NumberedWindow = {
  base: string;
  letter: string;
  mode: "question" | "answer";
  texts: string[];
  images: ChunkImageRef[];
  pageIdx: number;
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

/**
 * Label detection is intentionally narrow. A problem start is ONLY allowed when
 * a `type: "text"` block's `content[0]` is itself `type: "text"` and that string
 * begins with one of:
 *   1) `P` + number  → `P 3.1`, `P3.10`
 *   2) a number      → `1.`, `1.2`, `2)`, `1a)`, `2(a)`
 * Never scan mid-block / mid-string prose.
 */

/** Case 1: "P 1.2" / "P1.2" at the very start. */
const LEAD_P_NUMBER_RE = /^P\s*(\d+\.\d+)\b/i;
/** Case 2a: dotted "1.2" at the very start. */
const LEAD_DOTTED_RE = /^(\d+\.\d+)\b/;
/**
 * Case 2b: major "1." / "2)" / "5. (a)".
 * Requires "." or ")" after the digits so "3 Gränsvärde" does not match.
 */
const LEAD_MAJOR_RE = /^(\d+)\s*[.)](?:\s|\(|$)/;
/** Case 2c: PGA "2(a)" / "2 (a)" / "1.2(a)". */
const LEAD_PGA_PAREN_RE = /^(\d+(?:\.\d+)?)\s*\(([a-z])\)/i;
/**
 * Case 2d: PGA "2a)" / "1.2a)" — ")" required (not ".") so "2p." is ignored.
 */
const LEAD_PGA_GLUED_RE = /^(\d+(?:\.\d+)?)([a-z])\s*\)(?=\s|$)/i;
/** Case 2e: PGA "2 a)" / "1.2 a)". */
const LEAD_PGA_SPACED_RE = /^(\d+(?:\.\d+)?)\s+([a-z])\s*[.)](?=\s|$)/i;

/** @deprecated alias kept for rewrite helpers below */
const ANSWER_PGA_PAREN_RE = LEAD_PGA_PAREN_RE;
const ANSWER_PGA_GLUED_RE = LEAD_PGA_GLUED_RE;
const ANSWER_PGA_SPACED_RE = LEAD_PGA_SPACED_RE;

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

/** Strip a leading problem number so "(a)" after "P 3.1" / "1." can be read. */
const LEADING_NUMBER_STRIP_RE =
  /^\s*(?:P\s*)?(?:\d+\.\d+|\d+)\s*[.)]?\s*/i;

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

/**
 * Lead string for label detection — the ONLY place numbers are read from:
 * `block.type === "text"` and `content[0].type === "text"` (or bare string content).
 * Never reads content[1+], equations, titles, or mid-string prose.
 */
export function getTextBlockLead(block: MiddleBlock): string | null {
  if ((block.type ?? "").toLowerCase() !== "text") {
    return null;
  }
  const content = block.content;
  // Bare string is treated as a single text part (tests / simple fixtures).
  if (typeof content === "string") {
    const trimmed = content.trimStart();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }
  const first: unknown = content[0];
  if (typeof first === "string") {
    const trimmed = first.trimStart();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof first !== "object" || first === null) {
    return null;
  }
  const part = first as MiddleContentPart;
  // Hard rule: content[0] must be a text part.
  if ((part.type ?? "").toLowerCase() !== "text") {
    return null;
  }
  if (typeof part.content !== "string") {
    return null;
  }
  const trimmed = part.content.trimStart();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Detect a problem number at the start of a lead string.
 * Only `P + number` or a bare number form — nothing else.
 */
export function matchProblemStart(line: string): string | null {
  const trimmed = line.trimStart();
  const pMatch = LEAD_P_NUMBER_RE.exec(trimmed);
  if (pMatch !== null) {
    return pMatch[1]!;
  }
  const dottedMatch = LEAD_DOTTED_RE.exec(trimmed);
  if (dottedMatch !== null) {
    return dottedMatch[1]!;
  }
  const majorMatch = LEAD_MAJOR_RE.exec(trimmed);
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
 * Detect a numbered label start, including PGA forms like "2a)" / "2(a)".
 */
export function matchAnswerStart(line: string): AnswerStartMatch | null {
  const match = matchLabelStart(line);
  if (match === null) {
    return null;
  }
  return {
    problemNumber: match.problemNumber,
    subproblemLetter: match.subproblemLetter,
  };
}

/**
 * Match a problem label at the start of a lead string.
 * Lead must begin with `P` or a digit — the only two allowed cases.
 */
export function matchLabelStart(line: string): LabelMatch | null {
  const trimmed = line.trimStart();
  // Gate: only "P …" or "123…" — never "Uppgift", "Del", "Med …2p.", etc.
  if (!/^[P\d]/i.test(trimmed)) {
    return null;
  }

  const parenMatch = LEAD_PGA_PAREN_RE.exec(trimmed);
  if (parenMatch !== null) {
    return rejectCrossRefComma(trimmed, parenMatch[0].length, {
      problemNumber: parenMatch[1]!,
      subproblemLetter: parenMatch[2]!.toLowerCase(),
      fromPga: true,
    });
  }

  const gluedMatch = LEAD_PGA_GLUED_RE.exec(trimmed);
  if (gluedMatch !== null) {
    return rejectCrossRefComma(trimmed, gluedMatch[0].length, {
      problemNumber: gluedMatch[1]!,
      subproblemLetter: gluedMatch[2]!.toLowerCase(),
      fromPga: true,
    });
  }

  const spacedMatch = LEAD_PGA_SPACED_RE.exec(trimmed);
  if (spacedMatch !== null) {
    return rejectCrossRefComma(trimmed, spacedMatch[0].length, {
      problemNumber: spacedMatch[1]!,
      subproblemLetter: spacedMatch[2]!.toLowerCase(),
      fromPga: true,
    });
  }

  const pMatch = LEAD_P_NUMBER_RE.exec(trimmed);
  if (pMatch !== null) {
    return rejectCrossRefComma(trimmed, pMatch[0].length, {
      problemNumber: pMatch[1]!,
      subproblemLetter: null,
      fromPga: false,
    });
  }

  const dottedMatch = LEAD_DOTTED_RE.exec(trimmed);
  if (dottedMatch !== null) {
    return rejectCrossRefComma(trimmed, dottedMatch[0].length, {
      problemNumber: dottedMatch[1]!,
      subproblemLetter: null,
      fromPga: false,
    });
  }

  const majorMatch = LEAD_MAJOR_RE.exec(trimmed);
  if (majorMatch !== null) {
    return rejectCrossRefComma(trimmed, majorMatch[0].length, {
      problemNumber: majorMatch[1]!,
      subproblemLetter: null,
      fromPga: false,
    });
  }

  return null;
}

/** Reject wrapped cross-refs like "P 3.3, kontinuerlig". */
function rejectCrossRefComma(
  line: string,
  prefixLen: number,
  match: LabelMatch,
): LabelMatch | null {
  const rest = line.slice(prefixLen).trimStart();
  if (rest.startsWith(",")) {
    return null;
  }
  return match;
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

function letterAfterLeadingNumber(line: string): string | null {
  const stripped = line.replace(LEADING_NUMBER_STRIP_RE, "");
  if (stripped === line.trimStart()) {
    return null;
  }
  return matchSubproblemLetter(stripped);
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
 * Flatten middle_json into one reading-order token stream (no label logic).
 * `answerTokens` is always empty; kept for call-site compatibility.
 */
export function flattenMiddleJson(middleJson: MiddleJson): {
  problemTokens: FlattenToken[];
  answerTokens: FlattenToken[];
} {
  const tokens: FlattenToken[] = [];

  for (let pageIndex = 0; pageIndex < middleJson.pages.length; pageIndex++) {
    const page = middleJson.pages[pageIndex]!;
    const pageIdx = page.page_idx ?? pageIndex;
    for (const block of page.blocks) {
      const type = (block.type ?? "").toLowerCase();
      if (type === "page_number" || type === "footer") {
        continue;
      }

      const text = blockToText(block).replace(/\s+/g, " ").trim();
      if (text.length > 0) {
        tokens.push({ kind: "text", text, pageIdx });
      }

      if (isVisualFigureBlock(block)) {
        const found: string[] = [];
        collectImagePaths(block, found);
        for (const path of uniquePaths(found)) {
          tokens.push({ kind: "image", path, pageIdx });
        }
      }
    }
  }

  return { problemTokens: tokens, answerTokens: [] };
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

function mergeChunkParts(
  existing: ChunkParts | undefined,
  text: string,
  images: ChunkImageRef[],
  sourcePageIdx: number,
): ChunkParts {
  if (existing === undefined) {
    return { text, images: [...images], sourcePageIdx };
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
  return {
    text: mergedText,
    images: mergedImages,
    sourcePageIdx: existing.sourcePageIdx,
  };
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

  const loose = LOOSE_SOLUTION_START_RE.exec(beforeSvar);
  if (
    loose !== null &&
    loose.index !== undefined &&
    loose.index >= bodyOffset + 8
  ) {
    return beforeSvar.slice(0, loose.index).trim();
  }

  return beforeSvar.trim();
}

/**
 * When a chunk mixes stem + worked solution + "Svar:", peel them apart.
 * Solution narrative is discarded; only stem and final facit remain.
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

function windowsToChunks(windows: NumberedWindow[]): ProblemChunk[] {
  const questions = new Map<string, ChunkParts>();
  const answers = new Map<string, ChunkParts>();

  for (const window of windows) {
    const text = window.texts.join("\n").trim();
    if (text.length === 0 && window.images.length === 0) {
      continue;
    }
    const target = window.mode === "question" ? questions : answers;
    target.set(
      window.base,
      mergeChunkParts(
        target.get(window.base),
        text,
        window.images,
        window.pageIdx,
      ),
    );
  }

  const numbers = [...questions.keys()].sort(compareProblemNumbers);

  return numbers.map((problemNumber) => {
    const problemParts = questions.get(problemNumber);
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

function openWindow(
  match: LabelMatch,
  fullText: string,
  pageIdx: number,
  mode: "question" | "answer",
): NumberedWindow {
  let letter =
    match.subproblemLetter ?? letterAfterLeadingNumber(fullText) ?? "";
  let line = fullText;
  if (match.fromPga && match.subproblemLetter !== null) {
    line = rewritePgaAnswerLine(fullText, match.subproblemLetter);
    letter = match.subproblemLetter;
  } else if (letter.length === 0) {
    letter = matchSubproblemLetter(fullText) ?? "";
  }
  return {
    base: match.problemNumber,
    letter,
    mode,
    texts: [line],
    images: [],
    pageIdx,
  };
}

type StreamItem =
  | {
      kind: "label";
      match: LabelMatch;
      fullText: string;
      pageIdx: number;
    }
  | { kind: "text"; text: string; pageIdx: number }
  | { kind: "image"; path: string; pageIdx: number };

/**
 * Pass 1 — walk MinerU blocks and emit a flat stream.
 * Labels come ONLY from `type: "text"` leads (`content[0]`).
 */
function collectStreamItems(middleJson: MiddleJson): StreamItem[] {
  const items: StreamItem[] = [];

  for (let pageIndex = 0; pageIndex < middleJson.pages.length; pageIndex++) {
    const page = middleJson.pages[pageIndex]!;
    const pageIdx = page.page_idx ?? pageIndex;

    for (const block of page.blocks) {
      const type = (block.type ?? "").toLowerCase();
      if (type === "page_number" || type === "footer") {
        continue;
      }

      if (isVisualFigureBlock(block)) {
        const found: string[] = [];
        collectImagePaths(block, found);
        for (const path of uniquePaths(found)) {
          items.push({ kind: "image", path, pageIdx });
        }
        continue;
      }

      const fullText = blockToText(block).replace(/\s+/g, " ").trim();

      if (type === "text") {
        const lead = getTextBlockLead(block);
        const match = lead !== null ? matchLabelStart(lead) : null;
        if (match !== null) {
          items.push({
            kind: "label",
            match,
            fullText: fullText.length > 0 ? fullText : lead!,
            pageIdx,
          });
          continue;
        }
      }

      if (fullText.length > 0) {
        items.push({ kind: "text", text: fullText, pageIdx });
      }
    }
  }

  return items;
}

/**
 * Index of the first label that returns to the document's first problem
 * number (facit/answers). Cross-refs to other numbers do not count.
 * Returns `items.length` when there is no answer pass.
 */
export function findAnswerRestartIndex(items: StreamItem[]): number {
  const labelIndexes: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.kind === "label") {
      labelIndexes.push(i);
    }
  }
  if (labelIndexes.length === 0) {
    return items.length;
  }

  const firstBase = (items[labelIndexes[0]!] as Extract<
    StreamItem,
    { kind: "label" }
  >).match.problemNumber;

  for (let k = 1; k < labelIndexes.length; k++) {
    const idx = labelIndexes[k]!;
    const item = items[idx] as Extract<StreamItem, { kind: "label" }>;
    if (item.match.problemNumber === firstBase) {
      return idx;
    }
  }

  return items.length;
}

/**
 * Pass 2 — for each label, grab everything until the next label.
 * Items before the first label are ignored. Mode is question until the
 * answer-restart index, then answer.
 */
function windowsFromStream(items: StreamItem[]): NumberedWindow[] {
  const labelIndexes: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.kind === "label") {
      labelIndexes.push(i);
    }
  }
  if (labelIndexes.length === 0) {
    return [];
  }

  const restartAt = findAnswerRestartIndex(items);
  const windows: NumberedWindow[] = [];

  for (let k = 0; k < labelIndexes.length; k++) {
    const start = labelIndexes[k]!;
    const end =
      k + 1 < labelIndexes.length ? labelIndexes[k + 1]! : items.length;
    const labelItem = items[start] as Extract<StreamItem, { kind: "label" }>;
    const mode: "question" | "answer" =
      start >= restartAt ? "answer" : "question";

    const window = openWindow(
      labelItem.match,
      labelItem.fullText,
      labelItem.pageIdx,
      mode,
    );

    for (let i = start + 1; i < end; i++) {
      const item = items[i]!;
      if (item.kind === "image") {
        appendImage(window.images, item.path, window.letter);
        continue;
      }
      if (item.kind === "text") {
        const letter = matchSubproblemLetter(item.text);
        if (letter !== null) {
          window.letter = letter;
        }
        window.texts.push(item.text);
      }
      // Nested labels cannot appear between start and end by construction.
    }

    windows.push(window);
  }

  return windows;
}

/**
 * Two-pass problem detector:
 * 1) Collect every problem-start lead (`type: "text"` / `content[0]`).
 * 2) For each start, take all following content until the next start;
 *    Q vs A splits when numbering returns to the first problem number.
 */
export function detectProblemChunks(middleJson: MiddleJson): ProblemChunk[] {
  const items = collectStreamItems(middleJson);
  const windows = windowsFromStream(items);
  return windowsToChunks(windows);
}

/**
 * Legacy token-based splitter. Prefer `detectProblemChunks(middleJson)`.
 * Same two-pass idea: labels at token starts, restart on return to first base.
 */
export function splitIntoProblemChunks(
  problemTokens: FlattenToken[],
  answerTokens: FlattenToken[] = [],
): ProblemChunk[] {
  const items: StreamItem[] = [];
  for (const token of [...problemTokens, ...answerTokens]) {
    if (token.kind === "image") {
      items.push({ kind: "image", path: token.path, pageIdx: token.pageIdx });
      continue;
    }
    const match = matchLabelStart(token.text);
    if (match !== null) {
      items.push({
        kind: "label",
        match,
        fullText: token.text,
        pageIdx: token.pageIdx,
      });
      continue;
    }
    items.push({ kind: "text", text: token.text, pageIdx: token.pageIdx });
  }
  return windowsToChunks(windowsFromStream(items));
}
