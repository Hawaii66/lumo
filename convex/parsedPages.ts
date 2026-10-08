import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { pageHasAllProblemsReady } from "./lib/parsedPageCompletion";
import { query } from "./_generated/server";

/**
 * Completed original pages for a room file, resolved via the latest known pdfHash
 * from parse jobs for that file. Stale marks (no ready problems on the page) are hidden.
 */
export const listByFile = query({
  args: { fileId: v.id("files"), roomId: v.id("rooms") },
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

    const file = await ctx.db.get("files", args.fileId);
    if (file === null || file.roomId !== args.roomId) {
      return [];
    }

    const recentJobs = await ctx.db
      .query("parseJobs")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .order("desc")
      .take(20);

    const pdfHash = recentJobs.find((job) => job.pdfHash !== undefined)?.pdfHash;
    if (pdfHash === undefined) {
      return [];
    }

    const rows = await ctx.db
      .query("parsedPages")
      .withIndex("by_pdfHash", (q) => q.eq("pdfHash", pdfHash))
      .take(500);

    const completed: Array<number> = [];
    for (const row of rows) {
      if (await pageHasAllProblemsReady(ctx, pdfHash, row.pageNumber)) {
        completed.push(row.pageNumber);
      }
    }
    return completed.sort((a, b) => a - b);
  },
});
