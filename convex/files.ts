import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireRoomMember } from "./lib/roomAuth";
import {
  fileExtension,
  isAllowedRoomFileName,
  MAX_FILE_NAME_LENGTH,
  MAX_FILES_PER_ROOM,
  ROOM_FILE_TYPE_ERROR,
} from "./lib/roomFiles";
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
      storageId: v.id("_storage"),
      contentHash: v.string(),
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
        storageId: file.storageId,
        contentHash: file.contentHash,
        url,
      });
    }
    return result;
  },
});

export const rename = mutation({
  args: {
    fileId: v.id("files"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      throw new Error("Filen hittades inte");
    }

    await requireRoomMember(ctx, file.roomId);

    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Filnamnet får inte vara tomt");
    }
    if (name.length > MAX_FILE_NAME_LENGTH) {
      throw new Error(
        `Filnamnet får vara högst ${MAX_FILE_NAME_LENGTH} tecken`,
      );
    }
    if (!isAllowedRoomFileName(name)) {
      throw new Error(ROOM_FILE_TYPE_ERROR);
    }

    const previousExtension = fileExtension(file.name);
    const nextExtension = fileExtension(name);
    if (previousExtension !== nextExtension) {
      throw new Error(`Filändelsen måste förbli ${previousExtension}`);
    }

    if (name !== file.name) {
      // Only the display name changes; contentHash stays tied to file bytes.
      await ctx.db.patch(args.fileId, { name });
    }
    return null;
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

    const roomId = file.roomId;
    const contentHash = file.contentHash;

    // Keep storage if a global pdfMerges row still points at this blob.
    const mergeKeepers = await ctx.db
      .query("pdfMerges")
      .withIndex("by_mergedContentHash", (q) =>
        q.eq("mergedContentHash", contentHash),
      )
      .take(5);
    const keepStorage = mergeKeepers.some(
      (m) => m.mergedStorageId === file.storageId,
    );
    if (!keepStorage) {
      await ctx.storage.delete(file.storageId);
    }
    await ctx.db.delete(args.fileId);

    // Drop in-use info cell if this room has no other file with the same hash.
    const remaining = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", roomId))
      .take(MAX_FILES_PER_ROOM);
    const stillHasHash = remaining.some((f) => f.contentHash === contentHash);
    if (!stillHasHash) {
      const link = await ctx.db
        .query("cellsInUseByRoom")
        .withIndex("by_room_and_contentHash", (q) =>
          q.eq("roomId", roomId).eq("contentHash", contentHash),
        )
        .first();
      if (link !== null) {
        await ctx.db.delete(link._id);
      }
    }
    return null;
  },
});
