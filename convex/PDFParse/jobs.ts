import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireRoomMember } from "../lib/roomAuth";

const MAX_STATUS_UPDATES = 40;
const MAX_JOBS_LOOKUP = 20;

const statusUpdateValidator = v.object({
  message: v.string(),
  at: v.number(),
});

const jobStatusValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
);

const jobSummaryValidator = v.object({
  _id: v.id("pdfParseJobs"),
  status: jobStatusValidator,
  statusUpdates: v.array(statusUpdateValidator),
  error: v.union(v.string(), v.null()),
  problemCount: v.union(v.number(), v.null()),
});

async function hasProblemsForHash(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("problems")
    .withIndex("by_contentHash_and_row", (q) =>
      q.eq("contentHash", contentHash),
    )
    .take(1);
  return row.length > 0;
}

async function countProblemsForHash(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
): Promise<number> {
  const rows = await ctx.db
    .query("problems")
    .withIndex("by_contentHash_and_row", (q) =>
      q.eq("contentHash", contentHash),
    )
    .collect();
  return rows.length;
}

function isActiveStatus(
  status: Doc<"pdfParseJobs">["status"],
): status is "pending" | "running" {
  return status === "pending" || status === "running";
}

async function latestJobForFile(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"files">,
): Promise<Doc<"pdfParseJobs"> | null> {
  const jobs = await ctx.db
    .query("pdfParseJobs")
    .withIndex("by_file", (q) => q.eq("fileId", fileId))
    .order("desc")
    .take(MAX_JOBS_LOOKUP);
  return jobs[0] ?? null;
}

async function activeJobForContentHash(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
): Promise<Doc<"pdfParseJobs"> | null> {
  const jobs = await ctx.db
    .query("pdfParseJobs")
    .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
    .order("desc")
    .take(MAX_JOBS_LOOKUP);
  return jobs.find((job) => isActiveStatus(job.status)) ?? null;
}

function toJobSummary(job: Doc<"pdfParseJobs">) {
  return {
    _id: job._id,
    status: job.status,
    statusUpdates: job.statusUpdates,
    error: job.error ?? null,
    problemCount: job.problemCount ?? null,
  };
}

/**
 * Modal state for a PDF: whether problems already exist for the hash,
 * plus the latest / active job (without problem bodies).
 */
export const getParseStatus = query({
  args: { fileId: v.id("files") },
  returns: v.union(
    v.null(),
    v.object({
      fileName: v.string(),
      alreadyParsed: v.boolean(),
      problemCount: v.number(),
      job: v.union(jobSummaryValidator, v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      return null;
    }
    await requireRoomMember(ctx, file.roomId);

    const problemCount = await countProblemsForHash(ctx, file.contentHash);
    const alreadyParsed = problemCount > 0;
    const active = await activeJobForContentHash(ctx, file.contentHash);

    // Active jobs always show. Failed jobs show only when not already parsed.
    // Done jobs are never shown (problems exist; modal must not list them).
    let job: ReturnType<typeof toJobSummary> | null = null;
    if (active !== null) {
      job = toJobSummary(active);
    } else if (!alreadyParsed) {
      const latest = await latestJobForFile(ctx, args.fileId);
      if (latest !== null && latest.status === "failed") {
        job = toJobSummary(latest);
      }
    }

    return {
      fileName: file.name,
      alreadyParsed,
      problemCount,
      job,
    };
  },
});

export const start = mutation({
  args: { fileId: v.id("files") },
  returns: v.id("pdfParseJobs"),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      throw new Error("PDF-filen hittades inte");
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Endast PDF-filer kan tolkas");
    }

    const userId = await requireRoomMember(ctx, file.roomId);

    if (await hasProblemsForHash(ctx, file.contentHash)) {
      throw new Error("Uppgifterna är redan tolkade för denna PDF");
    }

    const existingActive = await activeJobForContentHash(
      ctx,
      file.contentHash,
    );
    if (existingActive !== null) {
      return existingActive._id;
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("pdfParseJobs", {
      fileId: file._id,
      roomId: file.roomId,
      contentHash: file.contentHash,
      createdBy: userId,
      status: "pending",
      statusUpdates: [{ message: "Startar…", at: now }],
    });

    await ctx.scheduler.runAfter(0, internal.PDFParse.pdfParse.runParseJob, {
      jobId,
    });

    return jobId;
  },
});

export const getInternal = internalQuery({
  args: { jobId: v.id("pdfParseJobs") },
  returns: v.union(
    v.object({
      _id: v.id("pdfParseJobs"),
      fileId: v.id("files"),
      roomId: v.id("rooms"),
      contentHash: v.string(),
      createdBy: v.id("users"),
      status: jobStatusValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) {
      return null;
    }
    return {
      _id: job._id,
      fileId: job.fileId,
      roomId: job.roomId,
      contentHash: job.contentHash,
      createdBy: job.createdBy,
      status: job.status,
    };
  },
});

export const appendStatus = internalMutation({
  args: {
    jobId: v.id("pdfParseJobs"),
    message: v.string(),
    status: v.optional(jobStatusValidator),
    /** When true, overwrite the last status line instead of appending. */
    replaceLast: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) {
      return null;
    }

    const entry = { message: args.message, at: Date.now() };
    const statusUpdates =
      args.replaceLast === true && job.statusUpdates.length > 0
        ? [...job.statusUpdates.slice(0, -1), entry]
        : [...job.statusUpdates, entry].slice(-MAX_STATUS_UPDATES);

    await ctx.db.patch(args.jobId, {
      statusUpdates,
      ...(args.status !== undefined ? { status: args.status } : {}),
    });
    return null;
  },
});

export const markDone = internalMutation({
  args: {
    jobId: v.id("pdfParseJobs"),
    problemCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) {
      return null;
    }

    const statusUpdates = [
      ...job.statusUpdates,
      { message: "Klar", at: Date.now() },
    ].slice(-MAX_STATUS_UPDATES);

    await ctx.db.patch(args.jobId, {
      status: "done",
      problemCount: args.problemCount,
      statusUpdates,
      error: undefined,
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    jobId: v.id("pdfParseJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) {
      return null;
    }

    const statusUpdates = [
      ...job.statusUpdates,
      { message: `Misslyckades: ${args.error}`, at: Date.now() },
    ].slice(-MAX_STATUS_UPDATES);

    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      statusUpdates,
    });
    return null;
  },
});
