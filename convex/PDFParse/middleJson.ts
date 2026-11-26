import { normalizeMineruImagePath } from "./mineruClient";
import type { MiddleBlock, MiddleContentPart, MiddleJson } from "./mineruSchema";
import {
  enrichFormatWithInferredPga,
  parsePgaFormat,
  type ProblemNumberFormat,
  type PgaStyle,
} from "./problemNumberFormat";

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
 * Label detection is format-guided. A problem start is ONLY allowed when a
 * block lead (`content[0]` text) matches `ProblemNumberFormat` (prefix,
 * segmentCount, terminator, optional PGA). Never scan mid-block / mid-string.
 */

/** PGA "2(a)" / "2 (a)" / "1.2(a)". */
const LEAD_PGA_PAREN_RE = /^(\d+(?:\.\d+)*)\s*\(([a-z])\)/i;
/** PGA "2a)" / "1.2a)" — ")" required so "2p." is ignored. */
const LEAD_PGA_GLUED_RE = /^(\d+(?:\.\d+)*)([a-z])\s*\)(?=\s|$)/i;
/** PGA "2 a)" / "1.2 a)". */
const LEAD_PGA_SPACED_RE = /^(\d+(?:\.\d+)*)\s+([a-z])\s*[.)](?=\s|$)/i;

const PGA_STYLE_RE: Record<PgaStyle, RegExp> = {
  paren: LEAD_PGA_PAREN_RE,
  glued: LEAD_PGA_GLUED_RE,
  spaced: LEAD_PGA_SPACED_RE,
};

/** Block types whose lead may open a problem window. */
const LABEL_BLOCK_TYPES = new Set(["text", "paragraph_title", "header"]);

/** Final facit marker inside a worked solution ("Svar: …"). */
const INLINE_SVAR_RE = /\bSvar\s*[:.]/i;

/**
 * Short "Svar:" that only points at the worked solution above.
 * In that case the explanation *is* the answer — do not discard it.
 */
const BACKREF_FACIT_RE =
  /^(?:se\s+ovan(?:stående)?|see\s+above)\.?$/i;

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
  /^\s*(?:P\s*)?\d+(?:\.\d+)*\s*[.)]?\s*/i;

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
 * `content[0].type === "text"` (or bare string content) on allowed block types.
 * Never reads content[1+], equations, or mid-string prose.
 */
export function getTextBlockLead(block: MiddleBlock): string | null {
  const type = (block.type ?? "").toLowerCase();
  if (!LABEL_BLOCK_TYPES.has(type)) {
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

function normalizeHeadingText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** True when a stream item text matches the format's answer-section heading. */
export function matchesAnswerSectionHeading(
  text: string,
  heading: string | null,
): boolean {
  if (heading === null) {
    return false;
  }
  const hay = normalizeHeadingText(text);
  const needle = normalizeHeadingText(heading);
  if (needle.length === 0) {
    return false;
  }
  return hay === needle || hay.startsWith(needle);
}

/**
 * Strip the format prefix from a lead. Returns null when a required prefix
 * is missing (lead is not a candidate).
 */
function stripFormatPrefix(
  line: string,
  prefix: string | null,
): { rest: string; consumed: number } | null {
  const trimmed = line.trimStart();
  const leadingWs = line.length - trimmed.length;
  if (prefix === null || prefix.trim().length === 0) {
    return { rest: trimmed, consumed: leadingWs };
  }
  const want = prefix.trim();
  if (!trimmed.toLowerCase().startsWith(want.toLowerCase())) {
    return null;
  }
  const afterPrefix = trimmed.slice(want.length);
  // Allow "P3.1" (no space) or "P 3.1" / "Uppgift 1".
  const rest = afterPrefix.trimStart();
  if (rest.length === afterPrefix.length && rest.length > 0) {
    // No whitespace after multi-char word prefixes → reject ("Uppgiftfoo").
    // Single-letter prefixes like "P" may glue: "P3.1".
    if (want.length > 1) {
      return null;
    }
  }
  const consumed = leadingWs + want.length + (afterPrefix.length - rest.length);
  return { rest, consumed };
}

function segmentCountOf(number: string): number {
  return number.split(".").length;
}

function buildNumberPattern(segmentCount: 1 | 2 | 3): string {
  if (segmentCount === 1) {
    return "(\\d+)";
  }
  if (segmentCount === 2) {
    return "(\\d+\\.\\d+)";
  }
  return "(\\d+\\.\\d+\\.\\d+)";
}

/**
 * Match a plain (non-PGA) number at the start of `rest` using the format.
 * Returns the match plus how many characters of `rest` were consumed.
 */
function matchPlainNumber(
  rest: string,
  format: ProblemNumberFormat,
): { problemNumber: string; matchedLen: number } | null {
  const numberPat = buildNumberPattern(format.segmentCount);
  if (format.requireTerminator) {
    const re = new RegExp(`^${numberPat}\\s*[.)](?=\\s|\\(|$)`);
    const match = re.exec(rest);
    if (match === null) {
      return null;
    }
    return { problemNumber: match[1]!, matchedLen: match[0].length };
  }
  // No terminator required: exact segment count + word boundary.
  // Reject longer dotted numbers (e.g. segmentCount 2 must not eat "1.2.3").
  const re = new RegExp(`^${numberPat}(?!\\.\\d)\\b`);
  const match = re.exec(rest);
  if (match === null) {
    return null;
  }
  return { problemNumber: match[1]!, matchedLen: match[0].length };
}

function matchPgaNumber(
  rest: string,
  style: PgaStyle,
  expectedSegments: number,
): { problemNumber: string; letter: string; matchedLen: number } | null {
  const match = PGA_STYLE_RE[style].exec(rest);
  if (match === null) {
    return null;
  }
  const problemNumber = match[1]!;
  if (segmentCountOf(problemNumber) !== expectedSegments) {
    return null;
  }
  return {
    problemNumber,
    letter: match[2]!.toLowerCase(),
    matchedLen: match[0].length,
  };
}

/**
 * Detect a problem number at the start of a lead string using `format`.
 */
export function matchProblemStart(
  line: string,
  format: ProblemNumberFormat,
): string | null {
  const match = matchLabelStart(line, format);
  return match?.problemNumber ?? null;
}

export type AnswerStartMatch = {
  problemNumber: string;
  subproblemLetter: string | null;
};

/**
 * Detect a numbered label start, including PGA forms when format.pgaFormat set.
 */
export function matchAnswerStart(
  line: string,
  format: ProblemNumberFormat,
): AnswerStartMatch | null {
  const match = matchLabelStart(line, format);
  if (match === null) {
    return null;
  }
  return {
    problemNumber: match.problemNumber,
    subproblemLetter: match.subproblemLetter,
  };
}

/**
 * Match a problem label at the start of a lead string using `format`.
 */
export function matchLabelStart(
  line: string,
  format: ProblemNumberFormat,
): LabelMatch | null {
  const stripped = stripFormatPrefix(line, format.prefix);
  if (stripped === null) {
    return null;
  }
  const { rest } = stripped;
  if (rest.length === 0) {
    return null;
  }

  const pga = parsePgaFormat(format.pgaFormat);
  if (pga !== null) {
    const pgaMatch = matchPgaNumber(rest, pga.style, pga.numberSegments);
    if (pgaMatch !== null) {
      return rejectCrossRefComma(rest, pgaMatch.matchedLen, {
        problemNumber: pgaMatch.problemNumber,
        subproblemLetter: pgaMatch.letter,
        fromPga: true,
      });
    }
  }

  const plain = matchPlainNumber(rest, format);
  if (plain === null) {
    return null;
  }
  return rejectCrossRefComma(rest, plain.matchedLen, {
    problemNumber: plain.problemNumber,
    subproblemLetter: null,
    fromPga: false,
  });
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
  const tryMatch = (source: string) =>
    LEAD_PGA_PAREN_RE.exec(source) ??
    LEAD_PGA_GLUED_RE.exec(source) ??
    LEAD_PGA_SPACED_RE.exec(source);

  let source = line.trimStart();
  let matched = tryMatch(source);
  if (matched === null) {
    const withoutWord = source.replace(/^[A-Za-zÅÄÖåäö]+\s*/, "");
    matched = tryMatch(withoutWord);
    if (matched !== null) {
      source = withoutWord;
    }
  }
  const rest =
    matched !== null
      ? source.slice(matched[0].length).trimStart()
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
}

/** Optional leading "7." / "1.2" / "1.2.3" / "P 1.2" before stem or solution prose. */
const LEADING_NUMBER_RE = /^\s*(?:P\s*)?\d+(?:\.\d+)*\s*[.)]?\s*/i;

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
 * Prefer the short final facit after "Svar:", unless that facit only says
 * "se ovan" — then keep the whole answer (explanation + Svar line).
 */
function peelFinalSvar(facit: string): string {
  const answerSvar = INLINE_SVAR_RE.exec(facit);
  if (answerSvar === null || answerSvar.index === undefined) {
    return facit.trim();
  }
  const after = facit.slice(answerSvar.index + answerSvar[0].length).trim();
  const before = facit.slice(0, answerSvar.index).trim();
  if (before.length > 0 && BACKREF_FACIT_RE.test(after)) {
    return facit.trim();
  }
  return after;
}

/**
 * When a chunk mixes stem + worked solution + "Svar:", peel them apart.
 * Solution narrative is discarded; only stem and final facit remain —
 * except "Svar: se ovan", where the narrative is kept.
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

  facit = peelFinalSvar(facit);

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
 * Labels come ONLY from leads (`content[0]`) that match `format`.
 */
function collectStreamItems(
  middleJson: MiddleJson,
  format: ProblemNumberFormat,
): StreamItem[] {
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

      if (LABEL_BLOCK_TYPES.has(type)) {
        const lead = getTextBlockLead(block);
        const match = lead !== null ? matchLabelStart(lead, format) : null;
        const allowTitle =
          type === "text" || format.titleBlocks === "when_matches";
        if (match !== null && allowTitle) {
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
 * Index where answer/facit mode begins.
 * 1) Prefer the format's exact `answerSectionHeading` when set.
 * 2) Else (when `allowNumberRestart`) the first label whose number was
 *    already seen — answers may skip early numbers.
 * Returns `items.length` when there is no answer pass.
 */
export function findAnswerRestartIndex(
  items: StreamItem[],
  format: ProblemNumberFormat,
): number {
  if (format.answerSectionHeading !== null) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      const text =
        item.kind === "text"
          ? item.text
          : item.kind === "label"
            ? item.fullText
            : null;
      if (
        text === null ||
        !matchesAnswerSectionHeading(text, format.answerSectionHeading)
      ) {
        continue;
      }
      for (let j = i + 1; j < items.length; j++) {
        if (items[j]!.kind === "label") {
          return j;
        }
      }
      return items.length;
    }
  }

  if (!format.allowNumberRestart) {
    return items.length;
  }

  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (item.kind !== "label") {
      continue;
    }
    const base = item.match.problemNumber;
    if (seen.has(base)) {
      return i;
    }
    seen.add(base);
  }

  return items.length;
}

/**
 * Pass 2 — for each label, grab everything until the next label.
 * Items before the first label are ignored. Mode is question until the
 * answer-restart index, then answer.
 */
function windowsFromStream(
  items: StreamItem[],
  format: ProblemNumberFormat,
): NumberedWindow[] {
  const labelIndexes: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]!.kind === "label") {
      labelIndexes.push(i);
    }
  }
  if (labelIndexes.length === 0) {
    return [];
  }

  const restartAt = findAnswerRestartIndex(items, format);
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
    }

    windows.push(window);
  }

  return windows;
}

export type BlockLeadSample = {
  pageIdx: number;
  blockType: string;
  lead: string;
};

/**
 * Sample block leads for the format-detect AI (small payload, not full JSON).
 */
export function sampleBlockLeads(
  middleJson: MiddleJson,
  limit = 100,
): BlockLeadSample[] {
  const samples: BlockLeadSample[] = [];

  for (let pageIndex = 0; pageIndex < middleJson.pages.length; pageIndex++) {
    const page = middleJson.pages[pageIndex]!;
    const pageIdx = page.page_idx ?? pageIndex;
    for (const block of page.blocks) {
      const type = (block.type ?? "").toLowerCase();
      if (type === "page_number" || type === "footer") {
        continue;
      }
      if (!LABEL_BLOCK_TYPES.has(type)) {
        continue;
      }
      const lead = getTextBlockLead(block);
      if (lead === null) {
        continue;
      }
      samples.push({
        pageIdx,
        blockType: type,
        lead: lead.slice(0, 200),
      });
      if (samples.length >= limit) {
        return samples;
      }
    }
  }

  return samples;
}

/**
 * Two-pass problem detector guided by `format`:
 * 1) Collect every problem-start lead matching the format.
 * 2) For each start, take all following content until the next start;
 *    Q vs A splits on answer heading and/or number restart.
 *
 * When `format.pgaFormat` is null, PGA labels found in block leads
 * (e.g. envar facit `1a)`) are inferred so answer pairing still works.
 */
export function detectProblemChunks(
  middleJson: MiddleJson,
  format: ProblemNumberFormat,
): ProblemChunk[] {
  const enriched = enrichFormatWithInferredPga(
    format,
    sampleBlockLeads(middleJson).map((sample) => sample.lead),
  );
  const items = collectStreamItems(middleJson, enriched);
  const windows = windowsFromStream(items, enriched);
  return windowsToChunks(windows);
}

/**
 * Legacy token-based splitter. Prefer `detectProblemChunks(middleJson, format)`.
 */
export function splitIntoProblemChunks(
  problemTokens: FlattenToken[],
  format: ProblemNumberFormat,
  answerTokens: FlattenToken[] = [],
): ProblemChunk[] {
  const items: StreamItem[] = [];
  for (const token of [...problemTokens, ...answerTokens]) {
    if (token.kind === "image") {
      items.push({ kind: "image", path: token.path, pageIdx: token.pageIdx });
      continue;
    }
    const match = matchLabelStart(token.text, format);
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
  return windowsToChunks(windowsFromStream(items, format));
}
