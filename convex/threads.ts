import {
  createThread,
  getFile,
  getThreadMetadata,
  listUIMessages,
  saveMessage,
} from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { FilePart, ImagePart } from "ai";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MAX_TITLE_LENGTH = 80;
const MAX_THREADS_PER_ROOM = 100;
const MAX_PROMPT_LENGTH = 4000;
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_FILENAME_LENGTH = 200;

const chatImageValidator = v.object({
  storageId: v.id("_storage"),
  filename: v.string(),
});

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

export const listByRoom = query({
  args: { roomId: v.id("rooms") },
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

    const threads = await ctx.db
      .query("roomThreads")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(MAX_THREADS_PER_ROOM);

    return threads.map((thread) => ({
      _id: thread._id,
      _creationTime: thread._creationTime,
      threadId: thread.threadId,
      title: thread.title,
      createdBy: thread.createdBy,
    }));
  },
});

export const create = mutation({
  args: {
    roomId: v.id("rooms"),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireRoomMember(ctx, args.roomId);

    const title = (args.title?.trim() || "Ny tråd").slice(0, MAX_TITLE_LENGTH);

    const threadId = await createThread(ctx, components.agent, {
      userId,
      title,
    });

    const roomThreadId = await ctx.db.insert("roomThreads", {
      roomId: args.roomId,
      threadId,
      title,
      createdBy: userId,
    });

    return { roomThreadId, threadId, title };
  },
});

export const get = query({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", userId).eq("roomId", args.roomId),
      )
      .unique();

    if (membership === null) {
      return null;
    }

    const roomThread = await ctx.db
      .query("roomThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();

    if (roomThread === null || roomThread.roomId !== args.roomId) {
      return null;
    }

    const metadata = await getThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
    });

    return {
      _id: roomThread._id,
      _creationTime: roomThread._creationTime,
      threadId: roomThread.threadId,
      title: roomThread.title,
      createdBy: roomThread.createdBy,
      summary: metadata.summary ?? null,
    };
  },
});

async function requireRoomThread(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  threadId: string,
) {
  const userId = await requireRoomMember(ctx, roomId);

  const roomThread = await ctx.db
    .query("roomThreads")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .unique();

  if (roomThread === null || roomThread.roomId !== roomId) {
    throw new Error("Tråden hittades inte");
  }

  return { userId, roomThread };
}

export const listMessages = query({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", userId).eq("roomId", args.roomId),
      )
      .unique();

    if (membership === null) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    const roomThread = await ctx.db
      .query("roomThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();

    if (roomThread === null || roomThread.roomId !== args.roomId) {
      return { page: [], isDone: true, continueCursor: "" };
    }

    return await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
  },
});

export const sendMessage = mutation({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
    prompt: v.string(),
    images: v.optional(v.array(chatImageValidator)),
  },
  handler: async (ctx, args) => {
    const prompt = args.prompt.trim();
    const images = args.images ?? [];

    if (prompt.length === 0 && images.length === 0) {
      throw new Error("Meddelandet får inte vara tomt");
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error("Meddelandet är för långt");
    }
    if (images.length > MAX_IMAGES_PER_MESSAGE) {
      throw new Error(
        `Du kan skicka högst ${MAX_IMAGES_PER_MESSAGE} bilder per meddelande`,
      );
    }

    const { userId } = await requireRoomThread(
      ctx,
      args.roomId,
      args.threadId,
    );

    const fileIds: Array<string> = [];
    const content: Array<
      { type: "text"; text: string } | ImagePart | FilePart
    > = [];

    for (const image of images) {
      const filename = image.filename.trim();
      if (filename.length === 0) {
        throw new Error("Filnamnet får inte vara tomt");
      }
      if (filename.length > MAX_IMAGE_FILENAME_LENGTH) {
        throw new Error(
          `Filnamnet får vara högst ${MAX_IMAGE_FILENAME_LENGTH} tecken`,
        );
      }

      const metadata = await ctx.db.system.get("_storage", image.storageId);
      if (metadata === null) {
        throw new Error("Bilden hittades inte i lagringen");
      }

      const contentType = metadata.contentType ?? "";
      if (!contentType.startsWith("image/")) {
        throw new Error("Endast bilder kan skickas till agenten just nu");
      }
      if (metadata.size > MAX_IMAGE_BYTES) {
        throw new Error("Bilden är för stor (max 10 MB)");
      }

      const { fileId, storageId: registeredStorageId } = await ctx.runMutation(
        components.agent.files.addFile,
        {
          storageId: image.storageId,
          hash: metadata.sha256,
          filename,
          mediaType: contentType,
        },
      );

      if (registeredStorageId !== image.storageId) {
        await ctx.storage.delete(image.storageId);
      }

      const { imagePart, filePart } = await getFile(
        ctx,
        components.agent,
        fileId,
      );
      content.push(imagePart ?? filePart);
      fileIds.push(fileId);
    }

    if (prompt.length > 0) {
      content.push({ type: "text", text: prompt });
    }

    const { messageId } =
      fileIds.length === 0
        ? await saveMessage(ctx, components.agent, {
            threadId: args.threadId,
            userId,
            prompt,
          })
        : await saveMessage(ctx, components.agent, {
            threadId: args.threadId,
            userId,
            message: {
              role: "user",
              content,
            },
            metadata: { fileIds },
          });

    await ctx.scheduler.runAfter(0, internal.agents.roomAgent.generateResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
    });

    return { messageId };
  },
});
