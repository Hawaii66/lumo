import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { segmentValidator } from "./lib/segments";

const MAX_PROBLEMS_PER_ROOM = 500;

export const getFileInternal = internalQuery({
  args: { fileId: v.id("files") },
  handler: async (ctx, args) => {
    return await ctx.db.get("files", args.fileId);
  },
});

export const getInternal = internalQuery({
  args: { problemId: v.id("problems") },
  handler: async (ctx, args) => {
    return await ctx.db.get("problems", args.problemId);
  },
});

export const markReady = internalMutation({
  args: {
    problemId: v.id("problems"),
    segments: v.array(segmentValidator),
    answerSegments: v.optional(v.array(segmentValidator)),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("problems", args.problemId, {
      segments: args.segments,
      answerSegments: args.answerSegments,
      status: "ready",
      error: undefined,
    });
  },
});

export const markFailed = internalMutation({
  args: {
    problemId: v.id("problems"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("problems", args.problemId, {
      status: "failed",
      error: args.error,
    });
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

    const problems = await ctx.db
      .query("problems")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(MAX_PROBLEMS_PER_ROOM);

    return problems.map((problem) => ({
      _id: problem._id,
      _creationTime: problem._creationTime,
      pdfHash: problem.pdfHash,
      problemNumber: problem.problemNumber,
      questionRaw: problem.questionRaw,
      answerRaw: problem.answerRaw,
      segments: problem.segments,
      answerSegments: problem.answerSegments,
      fileId: problem.fileId,
      status: problem.status,
      error: problem.error,
    }));
  },
});
