import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { requireRoomMember } from "../lib/roomAuth";
import { MAX_FILES_PER_ROOM } from "../lib/roomFiles";
import { PDF_INFO_MAX_LENGTH } from "../lib/prompts";

const MAX_IN_USE = 50;

const infoCellValidator = v.object({
  contentHash: v.string(),
  fileName: v.string(),
  text: v.string(),
});

async function isRoomMember(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return false;
  }
  const membership = await ctx.db
    .query("roomMembers")
    .withIndex("by_user_and_room", (q) =>
      q.eq("userId", userId).eq("roomId", roomId),
    )
    .unique();
  return membership !== null;
}

async function roomHasFileWithHash(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  contentHash: string,
): Promise<boolean> {
  const files = await ctx.db
    .query("files")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_FILES_PER_ROOM);
  return files.some((f) => f.contentHash === contentHash);
}

async function bestFileNameForHash(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  contentHash: string,
): Promise<string> {
  const files = await ctx.db
    .query("files")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .order("desc")
    .take(MAX_FILES_PER_ROOM);
  const match = files.find((f) => f.contentHash === contentHash);
  return match?.name ?? "PDF";
}

export const getByContentHash = internalQuery({
  args: { contentHash: v.string() },
  returns: v.union(
    v.object({
      _id: v.id("pdfInfo"),
      contentHash: v.string(),
      text: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("pdfInfo")
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
      text: row.text,
    };
  },
});

export const existsForContentHash = internalQuery({
  args: { contentHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("pdfInfo")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    return row !== null;
  },
});

export const replaceForContentHash = internalMutation({
  args: {
    contentHash: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const text =
      args.text.length > PDF_INFO_MAX_LENGTH
        ? args.text.slice(0, PDF_INFO_MAX_LENGTH).trimEnd()
        : args.text.trimEnd();

    const existing = await ctx.db
      .query("pdfInfo")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();

    if (existing !== null) {
      await ctx.db.patch(existing._id, { text });
      return null;
    }

    await ctx.db.insert("pdfInfo", {
      contentHash: args.contentHash,
      text,
    });
    return null;
  },
});

/** Add in-use link for a room after a successful info parse (idempotent). */
export const addInUseInternal = internalMutation({
  args: {
    roomId: v.id("rooms"),
    contentHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const info = await ctx.db
      .query("pdfInfo")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (info === null) {
      return null;
    }

    const existing = await ctx.db
      .query("cellsInUseByRoom")
      .withIndex("by_room_and_contentHash", (q) =>
        q.eq("roomId", args.roomId).eq("contentHash", args.contentHash),
      )
      .first();
    if (existing !== null) {
      return null;
    }

    await ctx.db.insert("cellsInUseByRoom", {
      roomId: args.roomId,
      contentHash: args.contentHash,
    });
    return null;
  },
});

export const listInUseByRoom = query({
  args: { roomId: v.id("rooms") },
  returns: v.array(infoCellValidator),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return [];
    }

    const links = await ctx.db
      .query("cellsInUseByRoom")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_IN_USE);

    const cells = [];
    for (const link of links) {
      const info = await ctx.db
        .query("pdfInfo")
        .withIndex("by_contentHash", (q) =>
          q.eq("contentHash", link.contentHash),
        )
        .first();
      if (info === null) {
        continue;
      }
      cells.push({
        contentHash: link.contentHash,
        fileName: await bestFileNameForHash(
          ctx,
          args.roomId,
          link.contentHash,
        ),
        text: info.text,
      });
    }
    return cells;
  },
});

export const listAvailableByRoom = query({
  args: { roomId: v.id("rooms") },
  returns: v.array(infoCellValidator),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return [];
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(MAX_FILES_PER_ROOM);

    const inUse = await ctx.db
      .query("cellsInUseByRoom")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_IN_USE);
    const inUseHashes = new Set(inUse.map((r) => r.contentHash));

    const seen = new Set<string>();
    const available = [];
    for (const file of files) {
      if (seen.has(file.contentHash) || inUseHashes.has(file.contentHash)) {
        continue;
      }
      const info = await ctx.db
        .query("pdfInfo")
        .withIndex("by_contentHash", (q) =>
          q.eq("contentHash", file.contentHash),
        )
        .first();
      if (info === null) {
        continue;
      }
      seen.add(file.contentHash);
      available.push({
        contentHash: file.contentHash,
        fileName: file.name,
        text: info.text,
      });
    }
    return available;
  },
});

export const addToRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    contentHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    if (!(await roomHasFileWithHash(ctx, args.roomId, args.contentHash))) {
      throw new Error("Rummet har ingen PDF med denna information");
    }

    const info = await ctx.db
      .query("pdfInfo")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    if (info === null) {
      throw new Error("Informationen är inte tolkad för denna PDF");
    }

    const existing = await ctx.db
      .query("cellsInUseByRoom")
      .withIndex("by_room_and_contentHash", (q) =>
        q.eq("roomId", args.roomId).eq("contentHash", args.contentHash),
      )
      .first();
    if (existing !== null) {
      return null;
    }

    await ctx.db.insert("cellsInUseByRoom", {
      roomId: args.roomId,
      contentHash: args.contentHash,
    });
    return null;
  },
});

export const removeFromRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    contentHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const existing = await ctx.db
      .query("cellsInUseByRoom")
      .withIndex("by_room_and_contentHash", (q) =>
        q.eq("roomId", args.roomId).eq("contentHash", args.contentHash),
      )
      .first();
    if (existing !== null) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/**
 * Drop in-use rows for a content hash in a room when no remaining files
 * share that hash (called from files.remove).
 */
export const cleanupInUseAfterFileRemove = internalMutation({
  args: {
    roomId: v.id("rooms"),
    contentHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await roomHasFileWithHash(ctx, args.roomId, args.contentHash)) {
      return null;
    }

    const link = await ctx.db
      .query("cellsInUseByRoom")
      .withIndex("by_room_and_contentHash", (q) =>
        q.eq("roomId", args.roomId).eq("contentHash", args.contentHash),
      )
      .first();
    if (link !== null) {
      await ctx.db.delete(link._id);
    }
    return null;
  },
});
