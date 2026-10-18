import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { sha256Hex } from "./lib/hash";
import {
  isAllowedRoomFile,
  isPdfFile,
  ROOM_FILE_TYPE_ERROR,
} from "./lib/roomFiles";

const MAX_FILES_PER_ROOM = 200;
const MAX_FILE_NAME_LENGTH = 200;

async function requireRoomMember(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Du måste vara inloggad");
  }

  const membership = await ctx.db
    .query("roomMembers")
    .withIndex("by_user_and_room", (q) =>
      q.eq("userId", userId).eq("roomId", roomId),
    )
    .unique();

  if (membership === null) {
    throw new Error("Du saknar åtkomst till rummet");
  }

  return userId;
}

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

    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Filnamnet får inte vara tomt");
    }
    if (name.length > MAX_FILE_NAME_LENGTH) {
      throw new Error(
        `Filnamnet får vara högst ${MAX_FILE_NAME_LENGTH} tecken`,
      );
    }

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) {
      throw new Error("Filen hittades inte i lagringen");
    }

    if (!isAllowedRoomFile(name, metadata.contentType)) {
      await ctx.storage.delete(args.storageId);
      throw new Error(ROOM_FILE_TYPE_ERROR);
    }

    const fileId = await ctx.db.insert("files", {
      roomId: args.roomId,
      name,
      storageId: args.storageId,
    });

    if (isPdfFile(name, metadata.contentType)) {
      await ctx.scheduler.runAfter(0, internal.files.computeContentHash, {
        fileId,
      });
    }

    return fileId;
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
      contentHash: v.optional(v.string()),
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

export const setContentHash = internalMutation({
  args: {
    fileId: v.id("files"),
    contentHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      return null;
    }
    if (file.contentHash === args.contentHash) {
      return null;
    }
    await ctx.db.patch(args.fileId, { contentHash: args.contentHash });
    return null;
  },
});

/** Hash PDF bytes in storage and store on the files row. */
export const computeContentHash = internalAction({
  args: { fileId: v.id("files") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.runQuery(internal.files.getInternal, {
      fileId: args.fileId,
    });
    if (file === null || file.contentHash !== undefined) {
      return null;
    }

    const blob = await ctx.storage.get(file.storageId);
    if (blob === null) {
      return null;
    }

    const contentHash = await sha256Hex(await blob.arrayBuffer());
    await ctx.runMutation(internal.files.setContentHash, {
      fileId: args.fileId,
      contentHash,
    });
    return null;
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
      contentHash: v.optional(v.string()),
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
        contentHash: file.contentHash,
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
