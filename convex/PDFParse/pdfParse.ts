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

type StatusReporter = (
  message: string,
  options?: { replaceLast?: boolean },
) => Promise<void>;

async function appendJobStatus(
  ctx: ActionCtx,
  jobId: Id<"pdfParseJobs">,
  message: string,
  options?: {
    status?: "pending" | "running" | "done" | "failed";
    replaceLast?: boolean;
  },
): Promise<void> {
  await ctx.runMutation(internal.PDFParse.jobs.appendStatus, {
    jobId,
    message,
    status: options?.status,
    replaceLast: options?.replaceLast,
  });
}

function formatAgentProgress(completed: number, total: number): string {
  const percent = total === 0 ? 100 : Math.round((completed / total) * 100);
  return `Tolkar uppgifter med AI… ${completed}/${total} (${percent}%)`;
}

async function saveParsedProblems(
  ctx: ActionCtx,
  contentHash: string,
  problems: LumoParsedProblem[],
): Promise<void> {
  await ctx.runMutation(internal.PDFParse.problems.replaceForContentHash, {
    contentHash,
    problems: problems.map((p) => ({
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
  onStatus?: (message: string) => Promise<void>,
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
          await onStatus?.("Använder cachad MinerU-tolkning");
          return parsed.data;
        }
      } catch {
        // Corrupt cache entry — fall through to MinerU.
      }
    }
  }

  await onStatus?.("Tolkar PDF med MinerU…");
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
  onStatus?: StatusReporter,
): Promise<LumoParsedProblem[]> {
  if (chunks.length === 0) {
    return [];
  }

  const total = chunks.length;
  let completed = 0;
  // Serialize status writes so concurrent workers don't reorder progress.
  let statusChain: Promise<void> = Promise.resolve();

  const reportProgress = (done: number, replaceLast: boolean) => {
    statusChain = statusChain.then(async () => {
      await onStatus?.(formatAgentProgress(done, total), { replaceLast });
    });
  };

  reportProgress(0, false);

  const results = await mapPool(
    chunks,
    AGENT_CONCURRENCY,
    async (chunk): Promise<LumoParsedProblem> => {
      const problem = await ctx.runAction(
        internal.PDFParse.lumoProblemAgent.convertProblemChunk,
        {
          userId,
          problemNumber: chunk.problemNumber,
          problemText: chunk.problemText,
          answerText: chunk.answerText,
        },
      );
      completed += 1;
      reportProgress(completed, true);
      return problem;
    },
  );

  await statusChain;
  return results;
}

async function parsePdfBytesToProblems(
  ctx: ActionCtx,
  userId: Id<"users">,
  pdfBytes: ArrayBuffer,
  contentHash: string,
  blobType: string,
  onStatus?: StatusReporter,
): Promise<LumoParsedProblem[]> {
  const middleJson = await getOrFetchMiddleJson(
    ctx,
    pdfBytes,
    contentHash,
    blobType,
    async (message) => {
      await onStatus?.(message);
    },
  );
  await onStatus?.("Delar upp uppgifter…");
  const { problemLines, answerLines } = flattenMiddleJson(middleJson);
  const chunks = splitIntoProblemChunks(problemLines, answerLines);
  return await convertChunksToProblems(ctx, userId, chunks, onStatus);
}

/**
 * Background job runner: updates `pdfParseJobs.statusUpdates` as it progresses.
 */
export const runParseJob = internalAction({
  args: {
    jobId: v.id("pdfParseJobs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.PDFParse.jobs.getInternal, {
      jobId: args.jobId,
    });
    if (job === null) {
      return null;
    }
    if (job.status === "done" || job.status === "failed") {
      return null;
    }

    try {
      await appendJobStatus(ctx, args.jobId, "Hämtar PDF…", {
        status: "running",
      });

      const file = await loadFile(ctx, job.fileId);
      const existingCount: number = await ctx.runQuery(
        internal.PDFParse.problems.countByContentHash,
        { contentHash: file.contentHash },
      );
      if (existingCount > 0) {
        await ctx.runMutation(internal.PDFParse.jobs.markDone, {
          jobId: args.jobId,
          problemCount: existingCount,
        });
        return null;
      }

      const blob = await ctx.storage.get(file.storageId);
      if (blob === null) {
        throw new Error("PDF-filen hittades inte i lagringen");
      }

      const problems = await parsePdfBytesToProblems(
        ctx,
        job.createdBy,
        await blob.arrayBuffer(),
        file.contentHash,
        blob.type,
        async (message, options) => {
          await appendJobStatus(ctx, args.jobId, message, options);
        },
      );

      await appendJobStatus(ctx, args.jobId, "Sparar uppgifter…");
      await saveParsedProblems(ctx, file.contentHash, problems);
      await ctx.runMutation(internal.PDFParse.jobs.markDone, {
        jobId: args.jobId,
        problemCount: problems.length,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Okänt fel vid tolkning";
      await ctx.runMutation(internal.PDFParse.jobs.markFailed, {
        jobId: args.jobId,
        error: message,
      });
    }

    return null;
  },
});

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
