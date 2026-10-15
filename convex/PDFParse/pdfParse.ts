import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import {
  flattenMiddleJson,
  splitIntoProblemChunks,
  type ProblemChunk,
} from "./middleJson";
import {
  extractMiddleJson,
  parseMineruCompletedResponse,
  parseMineruJobStatus,
  type MineruJobStatus,
} from "./mineruSchema";
import { parsedProblemValidator } from "./problemPageAgent";

const MINERU_PARSE_URL =
  "https://mineru-production-9651.up.railway.app/v1/file_parse?tier=basic&ocr_mode=auto&response_format=json&output_formats=middle_json";

const MINERU_BASE_URL = "https://mineru-production-9651.up.railway.app";

/** Max concurrent per-problem agent calls. */
const AGENT_CONCURRENCY = 5;

/** Poll MinerU task until completed (when POST returns a pending job). */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 80;

const parsedProblemListValidator = v.array(parsedProblemValidator);

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveMinerUUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("/")) {
    return `${MINERU_BASE_URL}${pathOrUrl}`;
  }
  return `${MINERU_BASE_URL}/${pathOrUrl}`;
}

async function waitForMinerUResult(initial: unknown): Promise<unknown> {
  let current: MineruJobStatus = parseMineruJobStatus(initial);
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const status = current.status;
    if (status === "completed") {
      return current;
    }
    if (status === "failed" || status === "cancelled" || status === "error") {
      throw new Error(`MinerU-jobb misslyckades: ${JSON.stringify(status)}`);
    }

    const statusUrl = current.status_url ?? current.result_url ?? null;

    if (statusUrl === null) {
      // Inline payload without explicit status — try completed schema next.
      if (Array.isArray(current.files) && current.files.length > 0) {
        return current;
      }
      throw new Error("MinerU-svar saknar status_url och completed status");
    }

    await sleep(POLL_INTERVAL_MS);
    const res = await fetch(resolveMinerUUrl(statusUrl));
    if (!res.ok) {
      throw new Error(
        `MinerU status-poll misslyckades: ${res.status} ${await res.text()}`,
      );
    }
    current = parseMineruJobStatus(await res.json());
  }
  throw new Error("MinerU-jobb timeout");
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index]!, index);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

/**
 * Parse a math PDF from Convex storage into per-problem raw fields.
 *
 * 1. POST the PDF to MinerU (middle_json)
 * 2. Split Problem / Svar sections into per-P-number chunks
 * 3. Run a problem agent on each chunk
 */
export const parseProblems = action({
  args: {
    fileId: v.id("_storage"),
    userId: v.id("users"),
  },
  returns: parsedProblemListValidator,
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.fileId);
    if (blob === null) {
      throw new Error("PDF-filen hittades inte i lagringen");
    }

    const form = new FormData();
    form.append("files", blob, "document.pdf");

    const parseResponse = await fetch(MINERU_PARSE_URL, {
      method: "POST",
      body: form,
    });

    if (!parseResponse.ok) {
      throw new Error(
        `MinerU file_parse misslyckades: ${parseResponse.status} ${await parseResponse.text()}`,
      );
    }

    const completed = await waitForMinerUResult(await parseResponse.json());
    const validated = parseMineruCompletedResponse(completed);
    const middleJson = extractMiddleJson(validated);
    const { problemLines, answerLines } = flattenMiddleJson(middleJson);
    const chunks: ProblemChunk[] = splitIntoProblemChunks(
      problemLines,
      answerLines,
    );

    if (chunks.length === 0) {
      return [];
    }

    const problems = await mapPool(
      chunks,
      AGENT_CONCURRENCY,
      async (chunk) => {
        const parsed: {
          rawProblemNumber: string;
          rawText: string;
          rawAnswer: string;
        } = await ctx.runAction(internal.PDFParse.problemPageAgent.parseProblemChunk, {
          userId: args.userId,
          problemNumber: chunk.problemNumber,
          problemText: chunk.problemText,
          answerText: chunk.answerText,
        });
        return parsed;
      },
    );

    return problems;
  },
});
