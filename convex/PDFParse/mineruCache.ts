import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation, internalQuery } from "../_generated/server";

const imageAssetValidator = v.object({
  path: v.string(),
  storageId: v.id("_storage"),
});

export const mineruWaiterValidator = v.union(
  v.object({
    type: v.literal("parseJob"),
    jobId: v.id("pdfParseJobs"),
  }),
  v.object({
    type: v.literal("adminRun"),
    runId: v.id("pdfAdminRuns"),
  }),
);

export type MineruWaiter =
  | { type: "parseJob"; jobId: Id<"pdfParseJobs"> }
  | { type: "adminRun"; runId: Id<"pdfAdminRuns"> };

function waiterKey(waiter: MineruWaiter): string {
  return waiter.type === "parseJob"
    ? `parseJob:${waiter.jobId}`
    : `adminRun:${waiter.runId}`;
}

function sameWaiter(a: MineruWaiter, b: MineruWaiter): boolean {
  return waiterKey(a) === waiterKey(b);
}

export const getByContentHash = internalQuery({
  args: { contentHash: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("mineruCache"),
      middleJsonStorageId: v.id("_storage"),
      imageAssets: v.array(imageAssetValidator),
      zipStorageId: v.union(v.id("_storage"), v.null()),
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
      zipStorageId: row.zipStorageId ?? null,
    };
  },
});

export const getInFlight = internalQuery({
  args: { contentHash: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("mineruInFlight"),
      contentHash: v.string(),
      claimedAt: v.number(),
      taskId: v.union(v.string(), v.null()),
      pdfStorageId: v.union(v.id("_storage"), v.null()),
      deadlineAt: v.union(v.number(), v.null()),
      waiters: v.array(mineruWaiterValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mineruInFlight")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (row === null) {
      return null;
    }
    return {
      _id: row._id,
      contentHash: row.contentHash,
      claimedAt: row.claimedAt,
      taskId: row.taskId ?? null,
      pdfStorageId: row.pdfStorageId ?? null,
      deadlineAt: row.deadlineAt ?? null,
      waiters: row.waiters ?? [],
    };
  },
});

export const save = internalMutation({
  args: {
    contentHash: v.string(),
    middleJsonStorageId: v.id("_storage"),
    imageAssets: v.optional(v.array(imageAssetValidator)),
    zipStorageId: v.optional(v.union(v.id("_storage"), v.null())),
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
      const previousZipId = existing.zipStorageId;
      const nextImageIds = new Set(nextImages.map((img) => img.storageId));
      const nextZipId =
        args.zipStorageId === undefined
          ? previousZipId
          : args.zipStorageId === null
            ? undefined
            : args.zipStorageId;

      await ctx.db.patch(existing._id, {
        middleJsonStorageId: args.middleJsonStorageId,
        ...(args.imageAssets !== undefined
          ? { imageAssets: nextImages }
          : {}),
        ...(args.zipStorageId !== undefined
          ? { zipStorageId: nextZipId }
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

      if (
        args.zipStorageId !== undefined &&
        previousZipId !== undefined &&
        previousZipId !== nextZipId
      ) {
        await ctx.storage.delete(previousZipId);
      }
      return null;
    }

    await ctx.db.insert("mineruCache", {
      contentHash: args.contentHash,
      middleJsonStorageId: args.middleJsonStorageId,
      ...(nextImages.length > 0 ? { imageAssets: nextImages } : {}),
      ...(args.zipStorageId !== undefined && args.zipStorageId !== null
        ? { zipStorageId: args.zipStorageId }
        : {}),
    });
    return null;
  },
});

/**
 * Replace cached figure assets with only paths referenced by problems.
 * Deletes previous image blobs that are no longer referenced.
 * Clears temporary ZIP storage once figures are persisted.
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
    const previousZipId = existing.zipStorageId;
    await ctx.db.patch(existing._id, {
      imageAssets: args.imageAssets,
      zipStorageId: undefined,
    });
    for (const img of previousImages) {
      if (!nextImageIds.has(img.storageId)) {
        await ctx.storage.delete(img.storageId);
      }
    }
    if (previousZipId !== undefined) {
      await ctx.storage.delete(previousZipId);
    }
    return null;
  },
});

/**
 * Claim the MinerU single-flight lock (no waiter registration).
 * - won: this caller should create/upload (or resume poll if taskId already set)
 * - otherwise: another fetcher owns the task
 */
export const tryClaimInFlight = internalMutation({
  args: {
    contentHash: v.string(),
    pdfStorageId: v.id("_storage"),
    /** Steal lock when claimedAt is older than this and there is no live deadline. */
    staleMs: v.number(),
  },
  returns: v.object({
    won: v.boolean(),
    taskId: v.union(v.string(), v.null()),
    deadlineAt: v.union(v.number(), v.null()),
  }),
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
        pdfStorageId: args.pdfStorageId,
      });
      return { won: true, taskId: null, deadlineAt: null };
    }

    const deadlineAt = existing.deadlineAt;
    const pastDeadline =
      deadlineAt !== undefined && now > deadlineAt;
    const staleWithoutTask =
      existing.taskId === undefined &&
      now - existing.claimedAt > args.staleMs;
    const canTakeOver = pastDeadline || staleWithoutTask;

    if (canTakeOver) {
      await ctx.db.patch(existing._id, {
        claimedAt: now,
        pdfStorageId: args.pdfStorageId,
        // Drop expired task; otherwise resume the same MinerU job.
        ...(pastDeadline
          ? { taskId: undefined, deadlineAt: undefined }
          : {}),
      });
      const taskId =
        pastDeadline || existing.taskId === undefined
          ? null
          : existing.taskId;
      return {
        won: true,
        taskId,
        deadlineAt: pastDeadline ? null : (deadlineAt ?? null),
      };
    }

    return {
      won: false,
      taskId: existing.taskId ?? null,
      deadlineAt: deadlineAt ?? null,
    };
  },
});

/** Register a job/admin run to resume when MinerU cache is ready. */
export const addWaiter = internalMutation({
  args: {
    contentHash: v.string(),
    waiter: mineruWaiterValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mineruInFlight")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (existing === null) {
      return null;
    }
    const waiters = existing.waiters ?? [];
    if (waiters.some((w) => sameWaiter(w, args.waiter))) {
      return null;
    }
    await ctx.db.patch(existing._id, {
      waiters: [...waiters, args.waiter],
    });
    return null;
  },
});

/** Record MinerU task id + deadline after successful create+upload. */
export const attachTask = internalMutation({
  args: {
    contentHash: v.string(),
    taskId: v.string(),
    deadlineAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mineruInFlight")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (existing === null) {
      return null;
    }
    await ctx.db.patch(existing._id, {
      taskId: args.taskId,
      deadlineAt: args.deadlineAt,
      claimedAt: Date.now(),
    });
    return null;
  },
});

/** Refresh claimedAt so a healthy poller is not stolen as stale. */
export const touchInFlight = internalMutation({
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
      await ctx.db.patch(existing._id, { claimedAt: Date.now() });
    }
    return null;
  },
});

/**
 * Remove in-flight row and return waiters so the caller can resume them.
 */
export const takeWaitersAndRelease = internalMutation({
  args: { contentHash: v.string() },
  returns: v.array(mineruWaiterValidator),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mineruInFlight")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (existing === null) {
      return [];
    }
    const waiters = existing.waiters ?? [];
    await ctx.db.delete(existing._id);
    return waiters;
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
    const zipStorageId = existing.zipStorageId;
    await ctx.db.delete(existing._id);
    await ctx.storage.delete(storageId);
    for (const img of imageAssets) {
      await ctx.storage.delete(img.storageId);
    }
    if (zipStorageId !== undefined) {
      await ctx.storage.delete(zipStorageId);
    }
    return true;
  },
});
