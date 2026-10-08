import { getAuthUserId } from "@convex-dev/auth/server";
import { vResultValidator, vWorkflowId } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { requireRoomMember } from "./lib/roomAuth";
import { pageRangeValidator } from "./lib/segments";
import { workflow } from "./lib/workflow";

const MAX_JOBS_PER_ROOM = 50;
const MAX_RANGES = 20;
const MAX_PAGES_PER_JOB = 10;

function validatePageRanges(
  pageRanges: Array<{ start: number; end: number }>,
): void {
  if (pageRanges.length === 0) {
    throw new Error("Välj minst ett sidintervall");
  }
  if (pageRanges.length > MAX_RANGES) {
    throw new Error(`Högst ${MAX_RANGES} intervall tillåtna`);
  }

  let totalPages = 0;
  for (const range of pageRanges) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 1 ||
      range.end < range.start
    ) {
      throw new Error("Ogiltigt sidintervall");
    }
    totalPages += range.end - range.start + 1;
  }

  if (totalPages > MAX_PAGES_PER_JOB) {
    throw new Error(`Högst ${MAX_PAGES_PER_JOB} sidor per tolkning`);
  }
}

export const onComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({
      jobId: v.id("parseJobs"),
    }),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("parseJobs", args.context.jobId);
    if (job === null) {
      return;
    }

    if (args.result.kind === "success") {
      if (job.status !== "completed") {
        await ctx.db.patch("parseJobs", job._id, { status: "completed" });
      }
      return;
    }

    if (args.result.kind === "failed") {
      await ctx.db.patch("parseJobs", job._id, {
        status: "failed",
        error: args.result.error,
      });
      return;
    }

    await ctx.db.patch("parseJobs", job._id, {
      status: "failed",
      error: "Tolkningsjobbet avbröts",
    });
  },
});

export const start = mutation({
  args: {
    roomId: v.id("rooms"),
    fileId: v.id("files"),
    mergedStorageId: v.id("_storage"),
    pageRanges: v.array(pageRangeValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireRoomMember(ctx, args.roomId);
    validatePageRanges(args.pageRanges);

    const file = await ctx.db.get("files", args.fileId);
    if (file === null || file.roomId !== args.roomId) {
      throw new Error("Filen hittades inte i rummet");
    }

    const mergedMeta = await ctx.db.system.get("_storage", args.mergedStorageId);
    if (mergedMeta === null) {
      throw new Error("Den sammanslagna PDF:en hittades inte");
    }
    if (
      mergedMeta.contentType !== undefined &&
      mergedMeta.contentType !== "application/pdf"
    ) {
      throw new Error("Den sammanslagna filen måste vara en PDF");
    }

    const jobId = await ctx.db.insert("parseJobs", {
      roomId: args.roomId,
      fileId: args.fileId,
      mergedStorageId: args.mergedStorageId,
      pageRanges: args.pageRanges,
      status: "pending",
      createdBy: userId,
    });

    const workflowId = await workflow.start(
      ctx,
      internal.workflows.parsePdfProblems.parsePdfProblems,
      {
        jobId,
        fileId: args.fileId,
        mergedStorageId: args.mergedStorageId,
        roomId: args.roomId,
        userId,
      },
      {
        onComplete: internal.parseJobs.onComplete,
        context: { jobId },
      },
    );

    await ctx.db.patch("parseJobs", jobId, {
      workflowId,
    });

    return jobId;
  },
});

export const listByRoom = query({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", userId).eq("roomId", args.roomId),
      )
      .unique();

    if (membership === null) {
      return [];
    }

    const jobs = await ctx.db
      .query("parseJobs")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(MAX_JOBS_PER_ROOM);

    return jobs.map((job) => ({
      _id: job._id,
      _creationTime: job._creationTime,
      fileId: job.fileId,
      pageRanges: job.pageRanges,
      status: job.status,
      error: job.error,
      pdfHash: job.pdfHash,
      problemCount: job.problemCount,
      skippedCount: job.skippedCount,
      workflowId: job.workflowId,
    }));
  },
});

export const get = query({
  args: { jobId: v.id("parseJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("parseJobs", args.jobId);
    if (job === null) {
      return null;
    }

    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", userId).eq("roomId", job.roomId),
      )
      .unique();

    if (membership === null) {
      return null;
    }

    return {
      _id: job._id,
      _creationTime: job._creationTime,
      fileId: job.fileId,
      roomId: job.roomId,
      pageRanges: job.pageRanges,
      status: job.status,
      error: job.error,
      pdfHash: job.pdfHash,
      problemCount: job.problemCount,
      skippedCount: job.skippedCount,
      workflowId: job.workflowId,
    };
  },
});
