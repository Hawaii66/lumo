import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

export const getByContentHash = internalQuery({
  args: { contentHash: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("mineruCache"),
      middleJsonStorageId: v.id("_storage"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mineruCache")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (row === null) {
      return null;
    }
    return {
      _id: row._id,
      middleJsonStorageId: row.middleJsonStorageId,
    };
  },
});

export const save = internalMutation({
  args: {
    contentHash: v.string(),
    middleJsonStorageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mineruCache")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();

    if (existing !== null) {
      const previousStorageId = existing.middleJsonStorageId;
      await ctx.db.patch(existing._id, {
        middleJsonStorageId: args.middleJsonStorageId,
      });
      if (previousStorageId !== args.middleJsonStorageId) {
        await ctx.storage.delete(previousStorageId);
      }
      return null;
    }

    await ctx.db.insert("mineruCache", {
      contentHash: args.contentHash,
      middleJsonStorageId: args.middleJsonStorageId,
    });
    return null;
  },
});
