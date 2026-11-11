import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { problemFlagValidator } from "../lib/lumoContent";
import { isShadowProblem } from "../lib/problemAccess";
import { requireAdmin } from "../lib/roles";
import { detectProblemChunks } from "./middleJson";
import { middleJsonSchema } from "./mineruSchema";

const MAX_STATUS_UPDATES = 40;
const MAX_RECENT_RUNS = 40;
const MAX_PROBLEMS_LIST = 500;

const kindValidator = v.union(v.literal("problems"), v.literal("info"));
const statusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);
const stageValidator = v.union(
  v.literal("queued"),
  v.literal("mineru"),
  v.literal("ai"),
  v.literal("commit"),
  v.literal("done"),
);
const fromStageValidator = v.union(
  v.literal("mineru"),
  v.literal("ai"),
  v.literal("commit"),
);
const statusUpdateValidator = v.object({
  message: v.string(),
  at: v.number(),
});

const runSummaryValidator = v.object({
  _id: v.id("pdfAdminRuns"),
  name: v.string(),
  contentHash: v.string(),
  kind: kindValidator,
  commitToDb: v.boolean(),
  status: statusValidator,
  stage: stageValidator,
  fromStage: fromStageValidator,
  invalidateMineru: v.boolean(),
  statusUpdates: v.array(statusUpdateValidator),
  error: v.union(v.string(), v.null()),
  problemCount: v.union(v.number(), v.null()),
  previewStorageId: v.union(v.id("_storage"), v.null()),
  _creationTime: v.number(),
});

function isActiveStatus(
  status: Doc<"pdfAdminRuns">["status"],
): status is "pending" | "running" {
  return status === "pending" || status === "running";
}

function toRunSummary(run: Doc<"pdfAdminRuns">) {
  return {
    _id: run._id,
    name: run.name,
    contentHash: run.contentHash,
    kind: run.kind,
    commitToDb: run.commitToDb,
    status: run.status,
    stage: run.stage,
    fromStage: run.fromStage,
    invalidateMineru: run.invalidateMineru,
    statusUpdates: run.statusUpdates,
    error: run.error ?? null,
    problemCount: run.problemCount ?? null,
    previewStorageId: run.previewStorageId ?? null,
    _creationTime: run._creationTime,
  };
}

async function softRequireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  try {
    return await requireAdmin(ctx);
  } catch {
    return null;
  }
}

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const createRun = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    kind: kindValidator,
    commitToDb: v.boolean(),
    invalidateMineru: v.optional(v.boolean()),
  },
  returns: v.id("pdfAdminRuns"),
  handler: async (ctx, args) => {
    const userId = await requireAdmin(ctx);

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) {
      throw new Error("PDF-filen hittades inte i lagringen");
    }
    const contentType = (metadata.contentType ?? "").toLowerCase();
    if (
      contentType !== "application/pdf" &&
      contentType !== "application/octet-stream" &&
      !args.name.toLowerCase().endsWith(".pdf")
    ) {
      throw new Error("Endast PDF-filer är tillåtna");
    }

    const now = Date.now();
    const runId = await ctx.db.insert("pdfAdminRuns", {
      name: args.name,
      storageId: args.storageId,
      contentHash: metadata.sha256,
      createdBy: userId,
      kind: args.kind,
      commitToDb: args.commitToDb,
      status: "pending",
      stage: "queued",
      fromStage: "mineru",
      invalidateMineru: args.invalidateMineru === true,
      statusUpdates: [{ message: "Startar…", at: now }],
    });

    await ctx.scheduler.runAfter(
      0,
      internal.PDFParse.adminParseRunner.runAdminParse,
      { runId },
    );

    return runId;
  },
});

export const listRecentRuns = query({
  args: {},
  returns: v.array(runSummaryValidator),
  handler: async (ctx) => {
    if ((await softRequireAdmin(ctx)) === null) {
      return [];
    }
    const runs = await ctx.db
      .query("pdfAdminRuns")
      .order("desc")
      .take(MAX_RECENT_RUNS);
    return runs.map(toRunSummary);
  },
});

export const getRunDetail = query({
  args: { runId: v.id("pdfAdminRuns") },
  returns: v.union(
    v.null(),
    v.object({
      run: runSummaryValidator,
      mineruCached: v.boolean(),
      pdfUrl: v.union(v.string(), v.null()),
      previewUrl: v.union(v.string(), v.null()),
      mineruJsonUrl: v.union(v.string(), v.null()),
      committedProblems: v.array(
        v.object({
          _id: v.id("problems"),
          problemNumber: v.string(),
          problem: v.string(),
          answer: v.string(),
          flags: v.array(problemFlagValidator),
          sourceQuestionPageIdx: v.union(v.number(), v.null()),
          sourceAnswerPageIdx: v.union(v.number(), v.null()),
        }),
      ),
      committedProblemCount: v.number(),
      committedInfoText: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    if ((await softRequireAdmin(ctx)) === null) {
      return null;
    }

    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }

    const mineru = await ctx.db
      .query("mineruCache")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", run.contentHash),
      )
      .first();

    const problemRows = await ctx.db
      .query("problems")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", run.contentHash),
      )
      .take(MAX_PROBLEMS_LIST);
    const committedProblems = problemRows
      .filter((row) => !isShadowProblem(row))
      .map((row) => ({
        _id: row._id,
        problemNumber: row.problemNumber,
        problem: row.problem,
        answer: row.answer,
        flags: row.flags ?? [],
        sourceQuestionPageIdx: row.sourceQuestionPageIdx ?? null,
        sourceAnswerPageIdx: row.sourceAnswerPageIdx ?? null,
      }));

    const info = await ctx.db
      .query("pdfInfo")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", run.contentHash),
      )
      .first();

    const pdfUrl = await ctx.storage.getUrl(run.storageId);
    const previewUrl =
      run.previewStorageId !== undefined
        ? await ctx.storage.getUrl(run.previewStorageId)
        : null;
    const mineruJsonUrl =
      mineru !== null
        ? await ctx.storage.getUrl(mineru.middleJsonStorageId)
        : null;

    return {
      run: toRunSummary(run),
      mineruCached: mineru !== null,
      pdfUrl,
      previewUrl,
      mineruJsonUrl,
      committedProblems,
      committedProblemCount: committedProblems.length,
      committedInfoText: info?.text ?? null,
    };
  },
});

export const restart = mutation({
  args: {
    runId: v.id("pdfAdminRuns"),
    fromStage: fromStageValidator,
    commitToDb: v.optional(v.boolean()),
    invalidateMineru: v.optional(v.boolean()),
  },
  returns: v.id("pdfAdminRuns"),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      throw new Error("Körningen hittades inte");
    }
    if (isActiveStatus(run.status)) {
      throw new Error("Körningen pågår redan");
    }
    if (args.fromStage === "commit" && run.previewStorageId === undefined) {
      throw new Error("Ingen förhandsgranskning att spara — kör AI först");
    }

    const now = Date.now();
    const commitToDb = args.commitToDb ?? run.commitToDb;
    const invalidateMineru =
      args.fromStage === "mineru"
        ? (args.invalidateMineru ?? false)
        : false;

    await ctx.db.patch(args.runId, {
      status: "pending",
      stage: "queued",
      fromStage: args.fromStage,
      commitToDb,
      invalidateMineru,
      error: undefined,
      statusUpdates: [
        {
          message: `Startar om från ${args.fromStage}…`,
          at: now,
        },
      ],
    });

    await ctx.scheduler.runAfter(
      0,
      internal.PDFParse.adminParseRunner.runAdminParse,
      { runId: args.runId },
    );

    return args.runId;
  },
});

export const invalidateMineruCache = mutation({
  args: { contentHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("mineruCache")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (existing === null) {
      return false;
    }
    const storageId = existing.middleJsonStorageId;
    await ctx.db.delete(existing._id);
    await ctx.storage.delete(storageId);
    return true;
  },
});

const splitChunkValidator = v.object({
  problemNumber: v.string(),
  problemText: v.string(),
  answerText: v.string(),
  sourceQuestionPageIdx: v.optional(v.number()),
  sourceAnswerPageIdx: v.optional(v.number()),
  questionImageCount: v.number(),
  answerImageCount: v.number(),
});

/**
 * Live problem-split preview from MinerU cache only (no AI).
 * Returns null when cache is missing.
 */
export const previewProblemSplit = action({
  args: { contentHash: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      chunkCount: v.number(),
      chunks: v.array(splitChunkValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }
    const adminId: Id<"users"> | null = await ctx.runQuery(
      internal.PDFParse.adminParse.getAdminUserIdInternal,
      {},
    );
    if (adminId === null || adminId !== userId) {
      throw new Error("Endast admin");
    }

    const cached: {
      _id: Id<"mineruCache">;
      middleJsonStorageId: Id<"_storage">;
      imageAssets: Array<{ path: string; storageId: Id<"_storage"> }>;
      zipStorageId: Id<"_storage"> | null;
    } | null = await ctx.runQuery(
      internal.PDFParse.mineruCache.getByContentHash,
      { contentHash: args.contentHash },
    );
    if (cached === null) {
      return null;
    }

    const blob = await ctx.storage.get(cached.middleJsonStorageId);
    if (blob === null) {
      throw new Error("MinerU-cachen saknar data");
    }
    const parsed = middleJsonSchema.safeParse(
      JSON.parse(await blob.text()),
    );
    if (!parsed.success) {
      throw new Error("MinerU-cachen är korrupt");
    }

    const chunks = detectProblemChunks(parsed.data);
    return {
      chunkCount: chunks.length,
      chunks: chunks.map((chunk) => ({
        problemNumber: chunk.problemNumber,
        problemText: chunk.problemText,
        answerText: chunk.answerText,
        ...(chunk.sourceQuestionPageIdx !== undefined
          ? { sourceQuestionPageIdx: chunk.sourceQuestionPageIdx }
          : {}),
        ...(chunk.sourceAnswerPageIdx !== undefined
          ? { sourceAnswerPageIdx: chunk.sourceAnswerPageIdx }
          : {}),
        questionImageCount: chunk.questionImages.length,
        answerImageCount: chunk.answerImages.length,
      })),
    };
  },
});

export const getAdminUserIdInternal = internalQuery({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    return await softRequireAdmin(ctx);
  },
});

export const getInternal = internalQuery({
  args: { runId: v.id("pdfAdminRuns") },
  returns: v.union(
    v.object({
      _id: v.id("pdfAdminRuns"),
      name: v.string(),
      storageId: v.id("_storage"),
      contentHash: v.string(),
      createdBy: v.id("users"),
      kind: kindValidator,
      commitToDb: v.boolean(),
      status: statusValidator,
      stage: stageValidator,
      fromStage: fromStageValidator,
      invalidateMineru: v.boolean(),
      previewStorageId: v.union(v.id("_storage"), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }
    return {
      _id: run._id,
      name: run.name,
      storageId: run.storageId,
      contentHash: run.contentHash,
      createdBy: run.createdBy,
      kind: run.kind,
      commitToDb: run.commitToDb,
      status: run.status,
      stage: run.stage,
      fromStage: run.fromStage,
      invalidateMineru: run.invalidateMineru,
      previewStorageId: run.previewStorageId ?? null,
    };
  },
});

export const appendStatus = internalMutation({
  args: {
    runId: v.id("pdfAdminRuns"),
    message: v.string(),
    status: v.optional(statusValidator),
    stage: v.optional(stageValidator),
    replaceLast: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }
    const entry = { message: args.message, at: Date.now() };
    const statusUpdates =
      args.replaceLast === true && run.statusUpdates.length > 0
        ? [...run.statusUpdates.slice(0, -1), entry]
        : [...run.statusUpdates, entry].slice(-MAX_STATUS_UPDATES);

    await ctx.db.patch(args.runId, {
      statusUpdates,
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.stage !== undefined ? { stage: args.stage } : {}),
    });
    return null;
  },
});

/** Clear one-shot invalidateMineru so resumed runs do not wipe a fresh cache. */
export const clearInvalidateMineru = internalMutation({
  args: { runId: v.id("pdfAdminRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run !== null && run.invalidateMineru) {
      await ctx.db.patch(args.runId, { invalidateMineru: false });
    }
    return null;
  },
});

export const savePreview = internalMutation({
  args: {
    runId: v.id("pdfAdminRuns"),
    previewStorageId: v.id("_storage"),
    problemCount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }
    const previous = run.previewStorageId;
    await ctx.db.patch(args.runId, {
      previewStorageId: args.previewStorageId,
      ...(args.problemCount !== undefined
        ? { problemCount: args.problemCount }
        : {}),
    });
    if (
      previous !== undefined &&
      previous !== args.previewStorageId
    ) {
      await ctx.storage.delete(previous);
    }
    return null;
  },
});

export const markDone = internalMutation({
  args: {
    runId: v.id("pdfAdminRuns"),
    problemCount: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }
    const statusUpdates = [
      ...run.statusUpdates,
      { message: "Klar", at: Date.now() },
    ].slice(-MAX_STATUS_UPDATES);

    await ctx.db.patch(args.runId, {
      status: "done",
      stage: "done",
      invalidateMineru: false,
      ...(args.problemCount !== undefined
        ? { problemCount: args.problemCount }
        : {}),
      statusUpdates,
      error: undefined,
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    runId: v.id("pdfAdminRuns"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }
    const statusUpdates = [
      ...run.statusUpdates,
      { message: `Misslyckades: ${args.error}`, at: Date.now() },
    ].slice(-MAX_STATUS_UPDATES);

    await ctx.db.patch(args.runId, {
      status: "failed",
      invalidateMineru: false,
      error: args.error,
      statusUpdates,
    });
    return null;
  },
});