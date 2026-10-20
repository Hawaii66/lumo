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
const MAX_JOBS_LOOKUP = 40;

export const parseJobKindValidator = v.union(
  v.literal("problems"),
  v.literal("info"),
);

export type ParseJobKind = "problems" | "info";

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
  kind: parseJobKindValidator,
  status: jobStatusValidator,
  statusUpdates: v.array(statusUpdateValidator),
  error: v.union(v.string(), v.null()),
  problemCount: v.union(v.number(), v.null()),
});

const kindStatusValidator = v.object({
  kind: parseJobKindValidator,
  label: v.string(),
  alreadyDone: v.boolean(),
  summary: v.union(v.string(), v.null()),
  job: v.union(jobSummaryValidator, v.null()),
});

function jobKind(job: Doc<"pdfParseJobs">): ParseJobKind {
  return job.kind ?? "problems";
}

async function hasProblemsForHash(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("problems")
    .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
    .take(1);
  return row.length > 0;
}

async function countProblemsForHash(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
): Promise<number> {
  const rows = await ctx.db
    .query("problems")
    .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
    .take(500);
  return rows.length;
}

async function hasInfoForHash(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("pdfInfo")
    .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
    .first();
  return row !== null;
}

function isActiveStatus(
  status: Doc<"pdfParseJobs">["status"],
): status is "pending" | "running" {
  return status === "pending" || status === "running";
}

async function jobsForContentHash(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
): Promise<Doc<"pdfParseJobs">[]> {
  return await ctx.db
    .query("pdfParseJobs")
    .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
    .order("desc")
    .take(MAX_JOBS_LOOKUP);
}

async function activeJobForContentHashAndKind(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
  kind: ParseJobKind,
): Promise<Doc<"pdfParseJobs"> | null> {
  const jobs = await jobsForContentHash(ctx, contentHash);
  return (
    jobs.find(
      (job) => jobKind(job) === kind && isActiveStatus(job.status),
    ) ?? null
  );
}

async function latestJobForFileAndKind(
  ctx: QueryCtx | MutationCtx,
  fileId: Id<"files">,
  kind: ParseJobKind,
): Promise<Doc<"pdfParseJobs"> | null> {
  // Prefer kind index when kind is set; also scan by_file for legacy rows.
  const byKind = await ctx.db
    .query("pdfParseJobs")
    .withIndex("by_file_and_kind", (q) =>
      q.eq("fileId", fileId).eq("kind", kind),
    )
    .order("desc")
    .take(MAX_JOBS_LOOKUP);
  if (byKind[0] !== undefined) {
    return byKind[0];
  }

  if (kind === "problems") {
    const jobs = await ctx.db
      .query("pdfParseJobs")
      .withIndex("by_file", (q) => q.eq("fileId", fileId))
      .order("desc")
      .take(MAX_JOBS_LOOKUP);
    return jobs.find((job) => jobKind(job) === "problems") ?? null;
  }

  return null;
}

function toJobSummary(job: Doc<"pdfParseJobs">) {
  return {
    _id: job._id,
    kind: jobKind(job),
    status: job.status,
    statusUpdates: job.statusUpdates,
    error: job.error ?? null,
    problemCount: job.problemCount ?? null,
  };
}

async function statusForKind(
  ctx: QueryCtx,
  fileId: Id<"files">,
  contentHash: string,
  kind: ParseJobKind,
  label: string,
  alreadyDone: boolean,
  summary: string | null,
): Promise<{
  kind: ParseJobKind;
  label: string;
  alreadyDone: boolean;
  summary: string | null;
  job: ReturnType<typeof toJobSummary> | null;
}> {
  const active = await activeJobForContentHashAndKind(ctx, contentHash, kind);

  let job: ReturnType<typeof toJobSummary> | null = null;
  if (active !== null) {
    job = toJobSummary(active);
  } else if (!alreadyDone) {
    const latest = await latestJobForFileAndKind(ctx, fileId, kind);
    if (latest !== null && latest.status === "failed") {
      job = toJobSummary(latest);
    }
  }

  return { kind, label, alreadyDone, summary, job };
}

/**
 * Modal state for a PDF: status of each parse job kind (problems / info).
 */
export const getParseStatus = query({
  args: { fileId: v.id("files") },
  returns: v.union(
    v.null(),
    v.object({
      fileName: v.string(),
      kinds: v.array(kindStatusValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      return null;
    }
    await requireRoomMember(ctx, file.roomId);

    const problemCount = await countProblemsForHash(ctx, file.contentHash);
    const problemsDone = problemCount > 0;
    const infoDone = await hasInfoForHash(ctx, file.contentHash);

    const problemsStatus = await statusForKind(
      ctx,
      args.fileId,
      file.contentHash,
      "problems",
      "Tolka uppgifter",
      problemsDone,
      problemsDone
        ? problemCount === 1
          ? "1 uppgift"
          : `${problemCount} uppgifter`
        : null,
    );

    const infoStatus = await statusForKind(
      ctx,
      args.fileId,
      file.contentHash,
      "info",
      "Tolka kursinformation",
      infoDone,
      infoDone ? "Kursinformation sparad" : null,
    );

    return {
      fileName: file.name,
      kinds: [problemsStatus, infoStatus],
    };
  },
});

export const start = mutation({
  args: {
    fileId: v.id("files"),
    kind: parseJobKindValidator,
  },
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

    if (args.kind === "problems") {
      if (await hasProblemsForHash(ctx, file.contentHash)) {
        throw new Error("Uppgifterna är redan tolkade för denna PDF");
      }
    } else if (await hasInfoForHash(ctx, file.contentHash)) {
      throw new Error("Informationen är redan tolkad för denna PDF");
    }

    const existingActive = await activeJobForContentHashAndKind(
      ctx,
      file.contentHash,
      args.kind,
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
      kind: args.kind,
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
      kind: parseJobKindValidator,
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
      kind: jobKind(job),
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
    problemCount: v.optional(v.number()),
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
