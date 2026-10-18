import { v } from "convex/values";
import {
  lumoParsedProblemValidator,
  lumoStaticDocumentValidator,
  type LumoParsedProblem,
} from "../lib/lumoContent";
import { requireRoomMember } from "../lib/roomAuth";
import { internalMutation, internalQuery, query } from "../_generated/server";

/** Upper bound of problems expected from a single PDF. */
const MAX_PROBLEMS_PER_PDF = 500;

const problemRowValidator = v.object({
  problemNumber: v.string(),
  problem: lumoStaticDocumentValidator,
  answer: lumoStaticDocumentValidator,
});

/**
 * Resolve file id → contentHash → cached problems.
 * Null when the file is missing or has no saved problems.
 */
export const listByFileId = query({
  args: { fileId: v.id("files") },
  returns: v.union(v.array(lumoParsedProblemValidator), v.null()),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      return null;
    }
    await requireRoomMember(ctx, file.roomId);

    const rows = await ctx.db
      .query("problems")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", file.contentHash))
      .take(MAX_PROBLEMS_PER_PDF);

    if (rows.length === 0) {
      return null;
    }

    return rows.map(
      (r): LumoParsedProblem => ({
        problemNumber: r.problemNumber,
        question: r.problem,
        answer: r.answer,
      }),
    );
  },
});

/** Count cached problems for a content hash (no auth — internal only). */
export const countByContentHash = internalQuery({
  args: { contentHash: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("problems")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", args.contentHash))
      .take(MAX_PROBLEMS_PER_PDF);
    return rows.length;
  },
});

/** Replace all problems for a content hash (delete existing, insert new rows). */
export const replaceForContentHash = internalMutation({
  args: {
    contentHash: v.string(),
    problems: v.array(problemRowValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("problems")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", args.contentHash))
      .take(MAX_PROBLEMS_PER_PDF);

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const problem of args.problems) {
      await ctx.db.insert("problems", {
        contentHash: args.contentHash,
        problemNumber: problem.problemNumber,
        problem: problem.problem,
        answer: problem.answer,
      });
    }

    return null;
  },
});
