import { createThread, getThreadMetadata } from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const MAX_TITLE_LENGTH = 80;
const MAX_THREADS_PER_ROOM = 100;

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
