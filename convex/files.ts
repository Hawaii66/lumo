import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireRoomMember } from "./lib/roomAuth";
import { MAX_FILES_PER_ROOM } from "./lib/roomFiles";
import { saveRoomFile } from "./lib/saveRoomFile";

export const generateUploadUrl = mutation({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    return await saveRoomFile(ctx, args);
  },
});

export const getInternal = internalQuery({
  args: { fileId: v.id("files") },
  returns: v.union(
    v.object({
      _id: v.id("files"),
      roomId: v.id("rooms"),
      name: v.string(),
      storageId: v.id("_storage"),
      contentHash: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      return null;
    }
    return {
      _id: file._id,
      roomId: file.roomId,
      name: file.name,
      storageId: file.storageId,
      contentHash: file.contentHash,
    };
  },
});

export const listByRoom = query({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.array(
    v.object({
      _id: v.id("files"),
      _creationTime: v.number(),
      name: v.string(),
      url: v.union(v.string(), v.null()),
    }),
  ),
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

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(MAX_FILES_PER_ROOM);

    const result = [];
    for (const file of files) {
      const url = await ctx.storage.getUrl(file.storageId);
      result.push({
        _id: file._id,
        _creationTime: file._creationTime,
        name: file.name,
        url,
      });
    }
    return result;
  },
});

export const remove = mutation({
  args: {
    fileId: v.id("files"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      throw new Error("Filen hittades inte");
    }

    await requireRoomMember(ctx, file.roomId);

    await ctx.storage.delete(file.storageId);
    await ctx.db.delete(args.fileId);
    return null;
  },
});
