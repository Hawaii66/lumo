import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

const SESSION_TTL_MS = 10 * 60 * 1000;
const MAX_FILE_NAME_LENGTH = 200;
const MAX_FILES_PER_ROOM = 200;
const TOKEN_BYTES = 24;

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("expired"),
);

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

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

async function getValidPendingSession(ctx: MutationCtx, token: string) {
  const session = await ctx.db
    .query("scanSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (session === null) {
    throw new Error("Sessionen hittades inte");
  }

  if (session.status !== "pending" || session.expiresAt <= Date.now()) {
    if (session.status === "pending") {
      await ctx.db.patch("scanSessions", session._id, { status: "expired" });
    }
    throw new Error("Sessionen har gått ut");
  }

  return session;
}

export const create = mutation({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.object({
    sessionId: v.id("scanSessions"),
    token: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireRoomMember(ctx, args.roomId);
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const token = randomToken();

    const sessionId = await ctx.db.insert("scanSessions", {
      token,
      roomId: args.roomId,
      createdBy: userId,
      status: "pending",
      expiresAt,
    });

    await ctx.scheduler.runAt(expiresAt, internal.scanSessions.expire, {
      sessionId,
    });

    return { sessionId, token, expiresAt };
  },
});

export const getStatus = query({
  args: {
    sessionId: v.id("scanSessions"),
  },
  returns: v.union(
    v.object({
      status: statusValidator,
      expiresAt: v.number(),
      fileId: v.union(v.id("files"), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const session = await ctx.db.get("scanSessions", args.sessionId);
    if (session === null || session.createdBy !== userId) {
      return null;
    }

    return {
      status: session.status,
      expiresAt: session.expiresAt,
      fileId: session.fileId ?? null,
    };
  },
});

export const cancel = mutation({
  args: {
    sessionId: v.id("scanSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const session = await ctx.db.get("scanSessions", args.sessionId);
    if (session === null || session.createdBy !== userId) {
      throw new Error("Sessionen hittades inte");
    }

    if (session.status === "pending") {
      await ctx.db.patch("scanSessions", session._id, { status: "expired" });
    }

    return null;
  },
});

export const getByToken = query({
  args: {
    token: v.string(),
  },
  returns: v.union(
    v.object({
      status: statusValidator,
      roomName: v.string(),
      expiresAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (args.token.length === 0) {
      return null;
    }

    const session = await ctx.db
      .query("scanSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (session === null) {
      return null;
    }

    const room = await ctx.db.get("rooms", session.roomId);
    if (room === null) {
      return null;
    }

    return {
      status: session.status,
      roomName: room.name,
      expiresAt: session.expiresAt,
    };
  },
});

export const generateUploadUrl = mutation({
  args: {
    token: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    await getValidPendingSession(ctx, args.token);
    return await ctx.storage.generateUploadUrl();
  },
});

export const complete = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.object({
    fileId: v.id("files"),
  }),
  handler: async (ctx, args) => {
    const session = await getValidPendingSession(ctx, args.token);

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

    const existingFiles = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", session.roomId))
      .take(MAX_FILES_PER_ROOM);

    if (existingFiles.length >= MAX_FILES_PER_ROOM) {
      throw new Error("Rummet har för många filer");
    }

    const fileId = await ctx.db.insert("files", {
      roomId: session.roomId,
      name,
      storageId: args.storageId,
    });

    await ctx.db.patch("scanSessions", session._id, {
      status: "completed",
      fileId,
    });

    return { fileId };
  },
});

export const expire = internalMutation({
  args: {
    sessionId: v.id("scanSessions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("scanSessions", args.sessionId);
    if (session !== null && session.status === "pending") {
      await ctx.db.patch("scanSessions", session._id, { status: "expired" });
    }
    return null;
  },
});
