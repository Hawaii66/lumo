import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

const imageAssetValidator = v.object({
  path: v.string(),
  storageId: v.id("_storage"),
});

export const getByContentHash = internalQuery({
  args: { contentHash: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("mineruCache"),
      middleJsonStorageId: v.id("_storage"),
      imageAssets: v.array(imageAssetValidator),
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
      imageAssets: row.imageAssets ?? [],
    };
  },
});

export const save = internalMutation({
  args: {
    contentHash: v.string(),
    middleJsonStorageId: v.id("_storage"),
    imageAssets: v.optional(v.array(imageAssetValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const nextImages = args.imageAssets ?? [];
    const existing = await ctx.db
      .query("mineruCache")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();

    if (existing !== null) {
      const previousStorageId = existing.middleJsonStorageId;
      const previousImages = existing.imageAssets ?? [];
      const nextImageIds = new Set(nextImages.map((img) => img.storageId));

      await ctx.db.patch(existing._id, {
        middleJsonStorageId: args.middleJsonStorageId,
        ...(args.imageAssets !== undefined
          ? { imageAssets: nextImages }
          : {}),
      });

      if (previousStorageId !== args.middleJsonStorageId) {
        await ctx.storage.delete(previousStorageId);
      }

      if (args.imageAssets !== undefined) {
        for (const img of previousImages) {
          if (!nextImageIds.has(img.storageId)) {
            await ctx.storage.delete(img.storageId);
          }
        }
      }
      return null;
    }

    await ctx.db.insert("mineruCache", {
      contentHash: args.contentHash,
      middleJsonStorageId: args.middleJsonStorageId,
      ...(nextImages.length > 0 ? { imageAssets: nextImages } : {}),
    });
    return null;
  },
});

/**
 * Replace cached figure assets with only paths referenced by problems.
 * Deletes previous image blobs that are no longer referenced.
 */
export const setImageAssets = internalMutation({
  args: {
    contentHash: v.string(),
    imageAssets: v.array(imageAssetValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mineruCache")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (existing === null) {
      return null;
    }

    const previousImages = existing.imageAssets ?? [];
    const nextImageIds = new Set(
      args.imageAssets.map((img) => img.storageId),
    );
    await ctx.db.patch(existing._id, {
      imageAssets: args.imageAssets,
    });
    for (const img of previousImages) {
      if (!nextImageIds.has(img.storageId)) {
        await ctx.storage.delete(img.storageId);
      }
    }
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

/** Delete MinerU cache row + storage blobs for a content hash. */
export const deleteByContentHash = internalMutation({
  args: { contentHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
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
    const imageAssets = existing.imageAssets ?? [];
    await ctx.db.delete(existing._id);
    await ctx.storage.delete(storageId);
    for (const img of imageAssets) {
      await ctx.storage.delete(img.storageId);
    }
    return true;
  },
});
