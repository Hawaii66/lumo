import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  action,
  internalAction,
  type ActionCtx,
} from "../_generated/server";
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

async function loadFile(
  ctx: ActionCtx,
  fileId: Id<"files">,
): Promise<{
  _id: Id<"files">;
  roomId: Id<"rooms">;
  storageId: Id<"_storage">;
  contentHash: string;
}> {
  const file = await ctx.runQuery(internal.files.getInternal, { fileId });
  if (file === null) {
    throw new Error("PDF-filen hittades inte");
  }
  return file;
}

async function saveParsedProblems(
  ctx: ActionCtx,
  contentHash: string,
  problems: LumoParsedProblem[],
): Promise<void> {
  await ctx.runMutation(internal.PDFParse.problems.replaceForContentHash, {
    contentHash,
    problems: problems.map((p, index) => ({
      row: index,
      problemNumber: p.problemNumber,
      problem: p.question,
      answer: p.answer,
    })),
  });
}

/**
 * Reuse cached MinerU middle_json when present,
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
 * Parse a math PDF into Lumo problems.
 *
 * 1. Load files row (contentHash set on upload)
 * 2. Reuse problems for that hash when present (skip AI)
 * 3. Otherwise MinerU + agents, then save problems keyed by hash
 */
export const parseProblems = action({
  args: {
    fileId: v.id("files"),
  },
  returns: lumoProblemListValidator,
  handler: async (ctx, args): Promise<LumoParsedProblem[]> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const file = await loadFile(ctx, args.fileId);

    const cached: LumoParsedProblem[] | null = await ctx.runQuery(
      api.PDFParse.problems.listByFileId,
      { fileId: args.fileId },
    );
    if (cached !== null) {
      return cached;
    }

    const blob = await ctx.storage.get(file.storageId);
    if (blob === null) {
      throw new Error("PDF-filen hittades inte i lagringen");
    }

    const problems: LumoParsedProblem[] = await parsePdfBytesToProblems(
      ctx,
      userId,
      await blob.arrayBuffer(),
      file.contentHash,
      blob.type,
    );
    await saveParsedProblems(ctx, file.contentHash, problems);
    return problems;
  },
});

/**
 * Internal tester for iterating on parse prompts via the Convex dashboard.
 * Uses MinerU middle_json cache, but never reads or writes the `problems` table —
 * always re-runs the AI conversion.
 */
export const problemParserTester = internalAction({
  args: {
    fileId: v.id("files"),
    userId: v.id("users"),
  },
  returns: lumoProblemListValidator,
  handler: async (ctx, args): Promise<LumoParsedProblem[]> => {
    const file = await loadFile(ctx, args.fileId);
    const blob = await ctx.storage.get(file.storageId);
    if (blob === null) {
      throw new Error("PDF-filen hittades inte i lagringen");
    }

    return await parsePdfBytesToProblems(
      ctx,
      args.userId,
      await blob.arrayBuffer(),
      file.contentHash,
      blob.type,
    );
  },
});
