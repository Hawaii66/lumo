import {
  createThread,
  getFile,
  getThreadMetadata,
  listUIMessages,
  saveMessage,
  syncStreams,
  updateThreadMetadata,
  vStreamArgs,
} from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  DEFAULT_CHAT_DELETION_EXPIRY,
  DEFAULT_CHAT_MODE,
  chatDeletionExpiryValidator,
  chatModeValidator,
  computeDeleteAt,
  type ChatDeletionExpiry,
  type ChatMode,
} from "./lib/lumoContent";
import { MAX_FILES_PER_ROOM } from "./lib/roomFiles";
import { problemVisibleInRoom } from "./lib/problemAccess";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { FilePart, ImagePart } from "ai";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MAX_TITLE_LENGTH = 80;
const MAX_THREADS_PER_ROOM = 100;
const EXPIRED_THREAD_PURGE_BATCH = 25;
const MAX_PROMPT_LENGTH = 4000;
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_FILENAME_LENGTH = 200;
const MAX_MENTIONED_PROBLEM_NUMBERS = 20;

/**
 * `@1.2` or `@1.2-tenta_2023-03` tokens (same shape as client composer).
 * Capture group 1 is the full token without `@`. Slugged form is first so
 * `@1.2-tenta` is not split into bare `@1.2`.
 */
const PROBLEM_MENTION_RE =
  /@((?:(\d+(?:\.\d+)*(?:·T\d+|[a-z])?)-(\S+))|(\d+(?:\.\d+)*(?:·T\d+|[a-z])?))/gi;

/** Number part of a stored mention token (`1.2` or `1.2-tenta_2023-03`). */
function mentionTokenNumber(token: string): string {
  const match = token
    .trim()
    .match(/^(\d+(?:\.\d+)*(?:·T\d+|[a-z])?)/i);
  return match?.[1] ?? token.trim();
}

function extractMentionedProblemNumbers(text: string): Array<string> {
  const tokens: Array<string> = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(PROBLEM_MENTION_RE)) {
    const token = match[1];
    if (token === undefined) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push(token);
  }
  return tokens;
}

function mergeMentionedProblemNumbers(
  existing: Array<string> | undefined,
  incoming: Array<string>,
): Array<string> | undefined {
  if (incoming.length === 0) {
    return existing !== undefined && existing.length > 0 ? existing : undefined;
  }
  const merged: Array<string> = [];
  const seen = new Set<string>();
  for (const number of [...(existing ?? []), ...incoming]) {
    const key = number.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    merged.push(number.trim());
    if (merged.length >= MAX_MENTIONED_PROBLEM_NUMBERS) break;
  }
  return merged.length > 0 ? merged : undefined;
}

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
      .take(MAX_THREADS_PER_ROOM * 2);

    return threads
      .filter((thread) => thread.archivedAt === undefined)
      .slice(0, MAX_THREADS_PER_ROOM)
      .map((thread) => ({
        _id: thread._id,
        _creationTime: thread._creationTime,
        threadId: thread.threadId,
        title: thread.title,
        createdBy: thread.createdBy,
        mode: (thread.mode ?? DEFAULT_CHAT_MODE) as ChatMode,
        deletionExpiry: (thread.deletionExpiry ??
          DEFAULT_CHAT_DELETION_EXPIRY) as ChatDeletionExpiry,
        deleteAt: thread.deleteAt ?? null,
        mentionedProblemNumbers: thread.mentionedProblemNumbers ?? [],
      }));
  },
});

export const listArchivedByRoom = query({
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
      .take(MAX_THREADS_PER_ROOM * 2);

    return threads
      .filter((thread) => thread.archivedAt !== undefined)
      .slice(0, MAX_THREADS_PER_ROOM)
      .map((thread) => ({
        _id: thread._id,
        _creationTime: thread._creationTime,
        threadId: thread.threadId,
        title: thread.title,
        archivedAt: thread.archivedAt as number,
      }));
  },
});

export const create = mutation({
  args: {
    roomId: v.id("rooms"),
    title: v.optional(v.string()),
    mode: v.optional(chatModeValidator),
    deletionExpiry: v.optional(chatDeletionExpiryValidator),
    mentionedProblemNumbers: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireRoomMember(ctx, args.roomId);

    const title = (args.title?.trim() || "Ny tråd").slice(0, MAX_TITLE_LENGTH);
    const mode: ChatMode = args.mode ?? DEFAULT_CHAT_MODE;
    const deletionExpiry: ChatDeletionExpiry =
      args.deletionExpiry ?? DEFAULT_CHAT_DELETION_EXPIRY;
    const deleteAt = computeDeleteAt(deletionExpiry);
    const mentionedProblemNumbers = mergeMentionedProblemNumbers(
      undefined,
      args.mentionedProblemNumbers ?? [],
    );

    const threadId = await createThread(ctx, components.agent, {
      userId,
      title,
    });

    const roomThreadId = await ctx.db.insert("roomThreads", {
      roomId: args.roomId,
      threadId,
      title,
      createdBy: userId,
      mode,
      deletionExpiry,
      ...(deleteAt !== undefined ? { deleteAt } : {}),
      ...(mentionedProblemNumbers !== undefined
        ? { mentionedProblemNumbers }
        : {}),
    });

    return {
      roomThreadId,
      threadId,
      title,
      mode,
      deletionExpiry,
      deleteAt: deleteAt ?? null,
      mentionedProblemNumbers: mentionedProblemNumbers ?? [],
    };
  },
});

export const setTitle = mutation({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const { roomThread } = await requireActiveRoomThread(
      ctx,
      args.roomId,
      args.threadId,
    );
    const title = args.title.trim().slice(0, MAX_TITLE_LENGTH);
    if (title.length === 0) {
      throw new Error("Titeln får inte vara tom");
    }

    await ctx.db.patch(roomThread._id, { title });
    await updateThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
      patch: { title },
    });

    return { title };
  },
});

export const setMode = mutation({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
    mode: chatModeValidator,
  },
  handler: async (ctx, args) => {
    const { roomThread } = await requireActiveRoomThread(
      ctx,
      args.roomId,
      args.threadId,
    );
    await ctx.db.patch(roomThread._id, { mode: args.mode });
    return { mode: args.mode };
  },
});

export const setDeletionExpiry = mutation({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
    deletionExpiry: chatDeletionExpiryValidator,
  },
  handler: async (ctx, args) => {
    const { roomThread } = await requireActiveRoomThread(
      ctx,
      args.roomId,
      args.threadId,
    );
    const deleteAt = computeDeleteAt(args.deletionExpiry);
    await ctx.db.patch(roomThread._id, {
      deletionExpiry: args.deletionExpiry,
      deleteAt,
    });
    return {
      deletionExpiry: args.deletionExpiry,
      deleteAt: deleteAt ?? null,
    };
  },
});

/** Archive a chat (manual). Soft-delete — restore via `unarchive`. */
export const archive = mutation({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { roomThread } = await requireActiveRoomThread(
      ctx,
      args.roomId,
      args.threadId,
    );
    await archiveRoomThread(ctx, roomThread);
    return null;
  },
});

/** Restore an archived chat to the active list. */
export const unarchive = mutation({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { roomThread } = await requireRoomThread(
      ctx,
      args.roomId,
      args.threadId,
    );
    if (roomThread.archivedAt === undefined) {
      return null;
    }

    const deletionExpiry: ChatDeletionExpiry =
      roomThread.deletionExpiry ?? DEFAULT_CHAT_DELETION_EXPIRY;
    const deleteAt = computeDeleteAt(deletionExpiry);
    await ctx.db.patch(roomThread._id, {
      archivedAt: undefined,
      deletionExpiry,
      deleteAt,
    });
    return null;
  },
});

/** Archive timed chats whose `deleteAt` has passed. Scheduled every 5 minutes. */
export const purgeExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("roomThreads")
      .withIndex("by_deleteAt", (q) => q.lte("deleteAt", now))
      .take(EXPIRED_THREAD_PURGE_BATCH);

    for (const roomThread of expired) {
      if (roomThread.archivedAt !== undefined) {
        // Clear stale deadline so the index stops resurfacing this row.
        await ctx.db.patch(roomThread._id, { deleteAt: undefined });
        continue;
      }
      await archiveRoomThread(ctx, roomThread);
    }

    if (expired.length === EXPIRED_THREAD_PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.threads.purgeExpired, {});
    }

    return null;
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

    if (
      roomThread === null ||
      roomThread.roomId !== args.roomId ||
      roomThread.archivedAt !== undefined
    ) {
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
      mode: (roomThread.mode ?? DEFAULT_CHAT_MODE) as ChatMode,
      deletionExpiry: (roomThread.deletionExpiry ??
        DEFAULT_CHAT_DELETION_EXPIRY) as ChatDeletionExpiry,
      deleteAt: roomThread.deleteAt ?? null,
      mentionedProblemNumbers: roomThread.mentionedProblemNumbers ?? [],
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

async function requireActiveRoomThread(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  threadId: string,
) {
  const result = await requireRoomThread(ctx, roomId, threadId);
  if (result.roomThread.archivedAt !== undefined) {
    throw new Error("Chatten är arkiverad");
  }
  return result;
}

/** Soft-archive: hide from active lists, keep messages for restore. */
async function archiveRoomThread(
  ctx: MutationCtx,
  roomThread: Doc<"roomThreads">,
) {
  if (roomThread.archivedAt !== undefined) {
    return;
  }
  await ctx.db.patch(roomThread._id, {
    archivedAt: Date.now(),
    deleteAt: undefined,
  });
}

export const listMessages = query({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const empty = {
      page: [],
      isDone: true,
      continueCursor: "",
      streams: undefined,
    };

    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return empty;
    }

    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", userId).eq("roomId", args.roomId),
      )
      .unique();

    if (membership === null) {
      return empty;
    }

    const roomThread = await ctx.db
      .query("roomThreads")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .unique();

    if (
      roomThread === null ||
      roomThread.roomId !== args.roomId ||
      roomThread.archivedAt !== undefined
    ) {
      return empty;
    }

    const paginated = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });

    return { ...paginated, streams };
  },
});

export const sendMessage = mutation({
  args: {
    roomId: v.id("rooms"),
    threadId: v.string(),
    prompt: v.string(),
    images: v.optional(v.array(chatImageValidator)),
    problemId: v.optional(v.id("problems")),
    problemIds: v.optional(v.array(v.id("problems"))),
    /** When set, agent context is sliced to this deluppgift for this turn. */
    subproblemLetter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const prompt = args.prompt.trim();
    const images = args.images ?? [];
    const problemIds = [
      ...new Set([
        ...(args.problemIds ?? []),
        ...(args.problemId !== undefined ? [args.problemId] : []),
      ]),
    ].slice(0, 20);

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

    const { userId, roomThread } = await requireActiveRoomThread(
      ctx,
      args.roomId,
      args.threadId,
    );
    const mode: ChatMode = roomThread.mode ?? DEFAULT_CHAT_MODE;

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

    const fromPrompt = extractMentionedProblemNumbers(prompt);
    const numbersCoveredByPrompt = new Set(
      fromPrompt.map((token) => mentionTokenNumber(token).toLowerCase()),
    );

    const problemNumbersFromIds: Array<string> = [];
    if (problemIds.length > 0) {
      const roomFiles = await ctx.db
        .query("files")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .take(MAX_FILES_PER_ROOM);
      for (const problemId of problemIds) {
        const problem = await ctx.db.get(problemId);
        if (problem === null) {
          throw new Error("Uppgiften hittades inte");
        }
        if (!problemVisibleInRoom(problem, args.roomId, roomFiles)) {
          throw new Error("Uppgiften tillhör inte det här rummet");
        }
        // Prefer the form already written in the prompt (`@3` or `@3-slug`).
        if (numbersCoveredByPrompt.has(problem.problemNumber.toLowerCase())) {
          continue;
        }
        // Attached without a text mention — store number only; prompt text is
        // the source of truth for PDF-scoped tokens when disambiguating.
        problemNumbersFromIds.push(problem.problemNumber.trim());
      }
    }

    const mentionedProblemNumbers = mergeMentionedProblemNumbers(
      roomThread.mentionedProblemNumbers,
      [...fromPrompt, ...problemNumbersFromIds],
    );
    if (
      mentionedProblemNumbers !== undefined &&
      mentionedProblemNumbers !== roomThread.mentionedProblemNumbers
    ) {
      const previous = roomThread.mentionedProblemNumbers ?? [];
      const changed =
        mentionedProblemNumbers.length !== previous.length ||
        mentionedProblemNumbers.some(
          (number, index) => number !== previous[index],
        );
      if (changed) {
        await ctx.db.patch(roomThread._id, { mentionedProblemNumbers });
      }
    }

    const subproblemLetter = (() => {
      const raw = args.subproblemLetter?.trim().toLowerCase();
      if (raw === undefined || raw.length === 0) return undefined;
      return /^[a-z]$/.test(raw) ? raw : undefined;
    })();

    await ctx.scheduler.runAfter(0, internal.agents.roomAgent.generateResponse, {
      threadId: args.threadId,
      promptMessageId: messageId,
      mode,
      roomId: args.roomId,
      problemIds: problemIds.length > 0 ? problemIds : undefined,
      subproblemLetter,
    });

    return { messageId };
  },
});
