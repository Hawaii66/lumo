import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import {
  lumoParsedProblemValidator,
  type LumoParsedProblem,
} from "../lib/lumoContent";
import {
  flattenMiddleJson,
  splitIntoProblemChunks,
  type ProblemChunk,
} from "./middleJson";
import { fetchMineruMiddleJson } from "./mineruClient";
import { middleJsonSchema, type MiddleJson } from "./mineruSchema";

/** Max concurrent per-problem agent calls. */
const AGENT_CONCURRENCY = 5;

const lumoProblemListValidator = v.array(lumoParsedProblemValidator);

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
 * Parse a math PDF from Convex storage into Lumo-language problems.
 *
 * 1. Hash PDF bytes; reuse cached MinerU middle_json when present
 * 2. Otherwise POST the PDF to MinerU and cache the validated middle_json
 * 3. Split Problem / Svar sections into per-P-number chunks
 * 4. Run the raw problem agent on each chunk
 * 5. Convert each raw problem to Lumo (text + latex + subproblem only)
 */
export const parseProblems = action({
  args: {
    fileId: v.id("_storage"),
    userId: v.id("users"),
  },
  returns: lumoProblemListValidator,
  handler: async (ctx, args) => {
    const blob = await ctx.storage.get(args.fileId);
    if (blob === null) {
      throw new Error("PDF-filen hittades inte i lagringen");
    }

    const contentHash = await sha256Hex(await blob.arrayBuffer());

    const cached: {
      _id: Id<"mineruCache">;
      middleJsonStorageId: Id<"_storage">;
    } | null = await ctx.runQuery(
      internal.PDFParse.mineruCache.getByContentHash,
      { contentHash },
    );

    let middleJson: MiddleJson | null = null;

    if (cached !== null) {
      const cachedBlob = await ctx.storage.get(cached.middleJsonStorageId);
      if (cachedBlob !== null) {
        try {
          const parsed = middleJsonSchema.safeParse(
            JSON.parse(await cachedBlob.text()),
          );
          if (parsed.success) {
            middleJson = parsed.data;
          }
        } catch {
          // Corrupt cache entry — fall through to MinerU.
        }
      }
    }

    if (middleJson === null) {
      middleJson = await fetchMineruMiddleJson(blob);
      const middleJsonStorageId = await ctx.storage.store(
        new Blob([JSON.stringify(middleJson)], {
          type: "application/json",
        }),
      );
      await ctx.runMutation(internal.PDFParse.mineruCache.save, {
        contentHash,
        middleJsonStorageId,
      });
    }

    const { problemLines, answerLines } = flattenMiddleJson(middleJson);
    const chunks: ProblemChunk[] = splitIntoProblemChunks(
      problemLines,
      answerLines,
    );

    if (chunks.length === 0) {
      return [];
    }

    const rawProblems = await mapPool(
      chunks,
      AGENT_CONCURRENCY,
      async (chunk) => {
        const parsed: {
          rawProblemNumber: string;
          rawText: string;
          rawAnswer: string;
        } = await ctx.runAction(
          internal.PDFParse.problemPageAgent.parseProblemChunk,
          {
            userId: args.userId,
            problemNumber: chunk.problemNumber,
            problemText: chunk.problemText,
            answerText: chunk.answerText,
          },
        );
        return parsed;
      },
    );

    const problems: LumoParsedProblem[] = await mapPool(
      rawProblems,
      AGENT_CONCURRENCY,
      async (raw): Promise<LumoParsedProblem> => {
        const converted: LumoParsedProblem = await ctx.runAction(
          internal.PDFParse.lumoProblemAgent.convertRawProblem,
          {
            userId: args.userId,
            raw,
          },
        );
        return converted;
      },
    );

    return problems;
  },
});
