import { v } from "convex/values";
import {
  lumoParsedProblemValidator,
  lumoStaticDocumentValidator,
  type LumoParsedProblem,
} from "../lib/lumoContent";
import { internalMutation, internalQuery } from "../_generated/server";

/** Upper bound of problems expected from a single PDF. */
const MAX_PROBLEMS_PER_PDF = 500;

const problemRowValidator = v.object({
  row: v.number(),
  problemNumber: v.string(),
  problem: lumoStaticDocumentValidator,
  answer: lumoStaticDocumentValidator,
});

/**
 * Resolve file id → contentHash → cached problems (ordered by `row`).
 * Null when the file is missing, has no hash yet, or has no saved problems.
 */
export const listByFileId = internalQuery({
  args: { fileId: v.id("files") },
  returns: v.union(v.array(lumoParsedProblemValidator), v.null()),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null || file.contentHash === undefined) {
      return null;
    }
    const pdfHash = file.contentHash;

    const rows = await ctx.db
      .query("problems")
      .withIndex("by_pdfHash_and_row", (q) => q.eq("pdfHash", pdfHash))
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

/**
 * Replace all problems for a PDF hash (delete existing, insert new rows).
 */
export const replaceForPdfHash = internalMutation({
  args: {
    pdfHash: v.string(),
    problems: v.array(problemRowValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("problems")
      .withIndex("by_pdfHash_and_row", (q) => q.eq("pdfHash", args.pdfHash))
      .take(MAX_PROBLEMS_PER_PDF);

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    for (const problem of args.problems) {
      await ctx.db.insert("problems", {
        pdfHash: args.pdfHash,
        row: problem.row,
        problemNumber: problem.problemNumber,
        problem: problem.problem,
        answer: problem.answer,
      });
    }

    return null;
  },
});
