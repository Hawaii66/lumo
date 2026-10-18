import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, type ActionCtx } from "../_generated/server";
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

async function loadCachedProblems(
  ctx: ActionCtx,
  pdfHash: string,
): Promise<LumoParsedProblem[] | null> {
  return await ctx.runQuery(internal.PDFParse.problems.listByPdfHash, {
    pdfHash,
  });
}

async function saveParsedProblems(
  ctx: ActionCtx,
  pdfHash: string,
  problems: LumoParsedProblem[],
): Promise<void> {
  await ctx.runMutation(internal.PDFParse.problems.replaceForPdfHash, {
    pdfHash,
    problems: problems.map((p, index) => ({
      row: index,
      problemNumber: p.problemNumber,
      problem: p.question,
      answer: p.answer,
    })),
  });
}

/**
 * Hash PDF bytes; reuse cached MinerU middle_json when present,
 * otherwise POST to MinerU and cache the validated middle_json.
 */
async function getOrFetchMiddleJson(
  ctx: ActionCtx,
  pdfBytes: ArrayBuffer,
  contentHash: string,
  blobType: string,
): Promise<MiddleJson> {
  const cached: {
    _id: Id<"mineruCache">;
    middleJsonStorageId: Id<"_storage">;
  } | null = await ctx.runQuery(
    internal.PDFParse.mineruCache.getByContentHash,
    { contentHash },
  );

  if (cached !== null) {
    const cachedBlob = await ctx.storage.get(cached.middleJsonStorageId);
    if (cachedBlob !== null) {
      try {
        const parsed = middleJsonSchema.safeParse(
          JSON.parse(await cachedBlob.text()),
        );
        if (parsed.success) {
          return parsed.data;
        }
      } catch {
        // Corrupt cache entry — fall through to MinerU.
      }
    }
  }

  const pdfForUpload = new Blob([new Uint8Array(pdfBytes)], {
    type: blobType || "application/pdf",
  });
  const middleJson = await fetchMineruMiddleJson(pdfForUpload);
  const middleJsonStorageId = await ctx.storage.store(
    new Blob([JSON.stringify(middleJson)], {
      type: "application/json",
    }),
  );
  await ctx.runMutation(internal.PDFParse.mineruCache.save, {
    contentHash,
    middleJsonStorageId,
  });
  return middleJson;
}

async function convertChunksToProblems(
  ctx: ActionCtx,
  userId: Id<"users">,
  chunks: ProblemChunk[],
): Promise<LumoParsedProblem[]> {
  if (chunks.length === 0) {
    return [];
  }

  return await mapPool(
    chunks,
    AGENT_CONCURRENCY,
    async (chunk): Promise<LumoParsedProblem> => {
      return await ctx.runAction(
        internal.PDFParse.lumoProblemAgent.convertProblemChunk,
        {
          userId,
          problemNumber: chunk.problemNumber,
          problemText: chunk.problemText,
          answerText: chunk.answerText,
        },
      );
    },
  );
}

async function parsePdfBytesToProblems(
  ctx: ActionCtx,
  userId: Id<"users">,
  pdfBytes: ArrayBuffer,
  contentHash: string,
  blobType: string,
): Promise<LumoParsedProblem[]> {
  const middleJson = await getOrFetchMiddleJson(
    ctx,
    pdfBytes,
    contentHash,
    blobType,
  );
  const { problemLines, answerLines } = flattenMiddleJson(middleJson);
  const chunks = splitIntoProblemChunks(problemLines, answerLines);
  return await convertChunksToProblems(ctx, userId, chunks);
}

/**
 * Production: parse a math PDF into Lumo problems.
 *
 * 1. Hash PDF bytes; reuse rows in `problems` when present (skip AI)
 * 2. Otherwise reuse/fetch MinerU middle_json, convert via agents, save rows
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

    // Convex storage Blobs are streaming and single-read — buffer once for hash + upload.
    const pdfBytes = await blob.arrayBuffer();
    const pdfHash = await sha256Hex(pdfBytes);

    const cachedProblems = await loadCachedProblems(ctx, pdfHash);
    if (cachedProblems !== null) {
      return cachedProblems;
    }

    const problems = await parsePdfBytesToProblems(
      ctx,
      args.userId,
      pdfBytes,
      pdfHash,
      blob.type,
    );
    await saveParsedProblems(ctx, pdfHash, problems);
    return problems;
  },
});

/**
 * Internal tester for iterating on parse prompts.
 * Uses MinerU middle_json cache, but never reads or writes the `problems` table —
 * always re-runs the AI conversion.
 */
export const problemParserTester = action({
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

    const pdfBytes = await blob.arrayBuffer();
    const pdfHash = await sha256Hex(pdfBytes);

    return await parsePdfBytesToProblems(
      ctx,
      args.userId,
      pdfBytes,
      pdfHash,
      blob.type,
    );
  },
});
