import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  internalAction,
  type ActionCtx,
} from "../_generated/server";
import {
  lumoParsedProblemWithImagesValidator,
  type LumoParsedProblem,
  type LumoParsedProblemWithImages,
} from "../lib/lumoContent";
import {
  getOrFetchMiddleJson,
  type MineruImageAsset,
} from "./getOrFetchMiddleJson";
import {
  flattenFullDocument,
  flattenMiddleJson,
  splitIntoProblemChunks,
  type ProblemChunk,
} from "./middleJson";
import { normalizeMineruImagePath } from "./mineruClient";
import { middleJsonSchema } from "./mineruSchema";

/** Max concurrent per-problem agent calls. */
const AGENT_CONCURRENCY = 5;

const lumoProblemListValidator = v.array(lumoParsedProblemWithImagesValidator);

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let firstError: unknown;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      if (firstError !== undefined) {
        return;
      }
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await fn(items[index]!, index);
      } catch (err: unknown) {
        firstError = err;
        return;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  // Await every worker so in-flight actions are not left dangling on failure.
  await Promise.all(workers);
  if (firstError !== undefined) {
    throw firstError;
  }
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

export type StatusReporter = (
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

function storageIdsForImages(
  images: Array<{ path: string; subproblemLetter: string }>,
  imageByPath: Map<string, Id<"_storage">>,
): Array<{ storageId: Id<"_storage">; subproblemLetter?: string }> {
  const out: Array<{ storageId: Id<"_storage">; subproblemLetter?: string }> =
    [];
  const seen = new Set<string>();
  for (const image of images) {
    const storageId = imageByPath.get(normalizeMineruImagePath(image.path));
    if (storageId === undefined) {
      continue;
    }
    const letter = image.subproblemLetter.trim().toLowerCase();
    const key = `${storageId}:${letter}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      storageId,
      ...(letter.length > 0 ? { subproblemLetter: letter } : {}),
    });
  }
  return out;
}

function imageAssetMap(
  imageAssets: Array<MineruImageAsset>,
): Map<string, Id<"_storage">> {
  const map = new Map<string, Id<"_storage">>();
  for (const asset of imageAssets) {
    map.set(normalizeMineruImagePath(asset.path), asset.storageId);
  }
  return map;
}

function attachChunkImages(
  problems: LumoParsedProblem[],
  chunks: ProblemChunk[],
  imageAssets: Array<MineruImageAsset>,
): LumoParsedProblemWithImages[] {
  const byPath = imageAssetMap(imageAssets);
  return problems.map((problem, index) => {
    const chunk = chunks[index];
    const questionImages = storageIdsForImages(
      chunk?.questionImages ?? [],
      byPath,
    );
    const answerImages = storageIdsForImages(chunk?.answerImages ?? [], byPath);
    return {
      ...problem,
      ...(questionImages.length > 0 ? { questionImages } : {}),
      ...(answerImages.length > 0 ? { answerImages } : {}),
    };
  });
}

async function saveParsedProblems(
  ctx: ActionCtx,
  contentHash: string,
  problems: LumoParsedProblemWithImages[],
): Promise<void> {
  await ctx.runMutation(internal.PDFParse.problems.replaceForContentHash, {
    contentHash,
    problems: problems.map((p) => ({
      problemNumber: p.problemNumber,
      problem: p.question,
      answer: p.answer,
      flags: p.flags,
      questionImages: p.questionImages,
      answerImages: p.answerImages,
      ...(p.sourceQuestionPageIdx !== undefined
        ? { sourceQuestionPageIdx: p.sourceQuestionPageIdx }
        : {}),
      ...(p.sourceAnswerPageIdx !== undefined
        ? { sourceAnswerPageIdx: p.sourceAnswerPageIdx }
        : {}),
    })),
  });
}

async function convertChunksToProblems(
  ctx: ActionCtx,
  userId: Id<"users">,
  chunks: ProblemChunk[],
  imageAssets: Array<MineruImageAsset>,
  onStatus?: StatusReporter,
): Promise<LumoParsedProblemWithImages[]> {
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

  try {
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
        return {
          ...problem,
          ...(chunk.sourceQuestionPageIdx !== undefined
            ? { sourceQuestionPageIdx: chunk.sourceQuestionPageIdx }
            : {}),
          ...(chunk.sourceAnswerPageIdx !== undefined
            ? { sourceAnswerPageIdx: chunk.sourceAnswerPageIdx }
            : {}),
        };
      },
    );
    return attachChunkImages(results, chunks, imageAssets);
  } finally {
    await statusChain;
  }
}

/**
 * Shared MinerU → chunk → AI pipeline for problems.
 * Does not read/write the problems table.
 */
export async function parsePdfBytesToProblems(
  ctx: ActionCtx,
  userId: Id<"users">,
  pdfBytes: ArrayBuffer,
  contentHash: string,
  blobType: string,
  onStatus?: StatusReporter,
): Promise<LumoParsedProblemWithImages[]> {
  const { middleJson, imageAssets } = await getOrFetchMiddleJson(
    ctx,
    pdfBytes,
    contentHash,
    blobType,
    async (message) => {
      await onStatus?.(message);
    },
  );
  await onStatus?.("Delar upp uppgifter…");
  const { problemTokens, answerTokens } = flattenMiddleJson(middleJson);
  const chunks = splitIntoProblemChunks(problemTokens, answerTokens);
  return await convertChunksToProblems(
    ctx,
    userId,
    chunks,
    imageAssets,
    onStatus,
  );
}

/**
 * Shared MinerU → flatten → AI pipeline for document info.
 * Does not read/write the pdfInfo table.
 */
export async function parsePdfBytesToInfo(
  ctx: ActionCtx,
  userId: Id<"users">,
  pdfBytes: ArrayBuffer,
  contentHash: string,
  blobType: string,
  onStatus?: StatusReporter,
): Promise<string> {
  const { middleJson } = await getOrFetchMiddleJson(
    ctx,
    pdfBytes,
    contentHash,
    blobType,
    async (message) => {
      await onStatus?.(message);
    },
  );
  await onStatus?.("Sammanställer dokumenttext…");
  const documentText = flattenFullDocument(middleJson);
  if (documentText.trim().length === 0) {
    return "";
  }

  await onStatus?.("Tolkar information med AI…");
  const result: { text: string } = await ctx.runAction(
    internal.PDFParse.lumoInfoAgent.convertDocumentInfo,
    {
      userId,
      documentText,
    },
  );
  return result.text;
}

/**
 * AI-only path: reuse existing MinerU cache (must already exist).
 * Throws if middle_json is not cached.
 */
export async function parseCachedMiddleJsonToProblems(
  ctx: ActionCtx,
  userId: Id<"users">,
  contentHash: string,
  onStatus?: StatusReporter,
): Promise<LumoParsedProblemWithImages[]> {
  const cached: {
    _id: Id<"mineruCache">;
    middleJsonStorageId: Id<"_storage">;
    imageAssets: Array<{ path: string; storageId: Id<"_storage"> }>;
  } | null = await ctx.runQuery(
    internal.PDFParse.mineruCache.getByContentHash,
    { contentHash },
  );
  if (cached === null) {
    throw new Error("Ingen MinerU-cache för denna PDF — kör från MinerU först");
  }
  const cachedBlob = await ctx.storage.get(cached.middleJsonStorageId);
  if (cachedBlob === null) {
    throw new Error("MinerU-cachen saknar data");
  }
  const parsed = middleJsonSchema.safeParse(
    JSON.parse(await cachedBlob.text()),
  );
  if (!parsed.success) {
    throw new Error("MinerU-cachen är korrupt");
  }
  await onStatus?.("Delar upp uppgifter…");
  const { problemTokens, answerTokens } = flattenMiddleJson(parsed.data);
  const chunks = splitIntoProblemChunks(problemTokens, answerTokens);
  return await convertChunksToProblems(
    ctx,
    userId,
    chunks,
    cached.imageAssets,
    onStatus,
  );
}

export async function parseCachedMiddleJsonToInfo(
  ctx: ActionCtx,
  userId: Id<"users">,
  contentHash: string,
  onStatus?: StatusReporter,
): Promise<string> {
  const cached: {
    _id: Id<"mineruCache">;
    middleJsonStorageId: Id<"_storage">;
    imageAssets: Array<{ path: string; storageId: Id<"_storage"> }>;
  } | null = await ctx.runQuery(
    internal.PDFParse.mineruCache.getByContentHash,
    { contentHash },
  );
  if (cached === null) {
    throw new Error("Ingen MinerU-cache för denna PDF — kör från MinerU först");
  }
  const cachedBlob = await ctx.storage.get(cached.middleJsonStorageId);
  if (cachedBlob === null) {
    throw new Error("MinerU-cachen saknar data");
  }
  const parsed = middleJsonSchema.safeParse(
    JSON.parse(await cachedBlob.text()),
  );
  if (!parsed.success) {
    throw new Error("MinerU-cachen är korrupt");
  }
  await onStatus?.("Sammanställer dokumenttext…");
  const documentText = flattenFullDocument(parsed.data);
  if (documentText.trim().length === 0) {
    return "";
  }
  await onStatus?.("Tolkar information med AI…");
  const result: { text: string } = await ctx.runAction(
    internal.PDFParse.lumoInfoAgent.convertDocumentInfo,
    {
      userId,
      documentText,
    },
  );
  return result.text;
}

async function runProblemsJob(
  ctx: ActionCtx,
  jobId: Id<"pdfParseJobs">,
  job: {
    fileId: Id<"files">;
    createdBy: Id<"users">;
  },
): Promise<void> {
  await appendJobStatus(ctx, jobId, "Hämtar PDF…", {
    status: "running",
  });

  const file = await loadFile(ctx, job.fileId);
  const existingCount: number = await ctx.runQuery(
    internal.PDFParse.problems.countByContentHash,
    { contentHash: file.contentHash },
  );
  if (existingCount > 0) {
    await ctx.runMutation(internal.PDFParse.jobs.markDone, {
      jobId,
      problemCount: existingCount,
    });
    return;
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
      await appendJobStatus(ctx, jobId, message, options);
    },
  );

  await appendJobStatus(ctx, jobId, "Sparar uppgifter…");
  await saveParsedProblems(ctx, file.contentHash, problems);
  await ctx.runMutation(internal.PDFParse.jobs.markDone, {
    jobId,
    problemCount: problems.length,
  });
}

async function runInfoJob(
  ctx: ActionCtx,
  jobId: Id<"pdfParseJobs">,
  job: {
    fileId: Id<"files">;
    roomId: Id<"rooms">;
    createdBy: Id<"users">;
  },
): Promise<void> {
  await appendJobStatus(ctx, jobId, "Hämtar PDF…", {
    status: "running",
  });

  const file = await loadFile(ctx, job.fileId);
  const existing: boolean = await ctx.runQuery(
    internal.PDFParse.pdfInfo.existsForContentHash,
    { contentHash: file.contentHash },
  );
  if (existing) {
    await ctx.runMutation(internal.PDFParse.pdfInfo.addInUseInternal, {
      roomId: job.roomId,
      contentHash: file.contentHash,
    });
    await ctx.runMutation(internal.PDFParse.jobs.markDone, { jobId });
    return;
  }

  const blob = await ctx.storage.get(file.storageId);
  if (blob === null) {
    throw new Error("PDF-filen hittades inte i lagringen");
  }

  const text = await parsePdfBytesToInfo(
    ctx,
    job.createdBy,
    await blob.arrayBuffer(),
    file.contentHash,
    blob.type,
    async (message, options) => {
      await appendJobStatus(ctx, jobId, message, options);
    },
  );

  await appendJobStatus(ctx, jobId, "Sparar information…");
  await ctx.runMutation(internal.PDFParse.pdfInfo.replaceForContentHash, {
    contentHash: file.contentHash,
    text,
  });
  await ctx.runMutation(internal.PDFParse.pdfInfo.addInUseInternal, {
    roomId: job.roomId,
    contentHash: file.contentHash,
  });
  await ctx.runMutation(internal.PDFParse.jobs.markDone, { jobId });
}

/**
 * Background job runner: updates `pdfParseJobs.statusUpdates` as it progresses.
 * Branches on job.kind (problems | info).
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
      if (job.kind === "info") {
        await runInfoJob(ctx, args.jobId, job);
      } else {
        await runProblemsJob(ctx, args.jobId, job);
      }
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
  handler: async (ctx, args): Promise<LumoParsedProblemWithImages[]> => {
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
