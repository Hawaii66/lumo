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

/**
 * Claim the MinerU single-flight lock for a content hash.
 * Returns `{ won: true }` if this caller should fetch MinerU.
 * Stale locks (older than ttlMs) are taken over.
 */
export const tryClaimInFlight = internalMutation({
  args: {
    contentHash: v.string(),
    ttlMs: v.number(),
  },
  returns: v.object({ won: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mineruInFlight")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();

    const now = Date.now();
    if (existing === null) {
      await ctx.db.insert("mineruInFlight", {
        contentHash: args.contentHash,
        claimedAt: now,
      });
      return { won: true };
    }

    if (now - existing.claimedAt > args.ttlMs) {
      await ctx.db.patch(existing._id, { claimedAt: now });
      return { won: true };
    }

    return { won: false };
  },
});

export const releaseInFlight = internalMutation({
  args: { contentHash: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mineruInFlight")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});
