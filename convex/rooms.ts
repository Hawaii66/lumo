import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireRoomMember } from "./lib/roomAuth";
import { mutation, query } from "./_generated/server";

const MAX_FIELD_LENGTH = 50;
const MAX_GENERAL_INFO_LENGTH = 4000;
const MAX_ROOMS = 100;
const MAX_MEMBERS = 100;

function trimField(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} får inte vara tomt`);
  }
  if (trimmed.length > MAX_FIELD_LENGTH) {
    throw new Error(`${label} får vara högst ${MAX_FIELD_LENGTH} tecken`);
  }
  return trimmed;
}

function normalizeGeneralInfo(value: string): string {
  if (value.length > MAX_GENERAL_INFO_LENGTH) {
    throw new Error(
      `Allmän information får vara högst ${MAX_GENERAL_INFO_LENGTH} tecken`,
    );
  }
  return value.trimEnd();
}

function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  if (trimmed.length === 0) {
    throw new Error("E-post får inte vara tomt");
  }
  if (!trimmed.includes("@")) {
    throw new Error("Ogiltig e-postadress");
  }
  return trimmed;
}

const roomSummaryValidator = v.object({
  _id: v.id("rooms"),
  _creationTime: v.number(),
  name: v.string(),
  description: v.string(),
});

const roomDetailValidator = roomSummaryValidator.extend({
  generalInfo: v.string(),
});

export const list = query({
  args: {},
  returns: v.array(roomSummaryValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    const memberships = await ctx.db
      .query("roomMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(MAX_ROOMS);

    const rooms = [];
    for (const membership of memberships) {
      const room = await ctx.db.get(membership.roomId);
      if (room !== null) {
        rooms.push({
          _id: room._id,
          _creationTime: room._creationTime,
          name: room.name,
          description: room.description,
        });
      }
    }
    return rooms;
  },
});

export const get = query({
  args: { roomId: v.id("rooms") },
  returns: v.union(roomDetailValidator, v.null()),
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

    const room = await ctx.db.get(args.roomId);
    if (room === null) {
      return null;
    }

    return {
      _id: room._id,
      _creationTime: room._creationTime,
      name: room.name,
      description: room.description,
      generalInfo: room.generalInfo ?? "",
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
  },
  returns: v.id("rooms"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad för att skapa ett rum");
    }

    const name = trimField(args.name, "Namn");
    const description = trimField(args.description, "Beskrivning");

    const roomId = await ctx.db.insert("rooms", {
      name,
      description,
    });

    await ctx.db.insert("roomMembers", {
      roomId,
      userId,
    });

    return roomId;
  },
});

export const update = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
    description: v.string(),
    generalInfo: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const room = await ctx.db.get(args.roomId);
    if (room === null) {
      throw new Error("Rummet hittades inte");
    }

    const name = trimField(args.name, "Namn");
    const description = trimField(args.description, "Beskrivning");
    const generalInfo = normalizeGeneralInfo(args.generalInfo);

    await ctx.db.patch(args.roomId, { name, description, generalInfo });
    return null;
  },
});

export const listMembers = query({
  args: { roomId: v.id("rooms") },
  returns: v.union(
    v.array(
      v.object({
        userId: v.id("users"),
        name: v.union(v.string(), v.null()),
        email: v.union(v.string(), v.null()),
        image: v.union(v.string(), v.null()),
        isViewer: v.boolean(),
      }),
    ),
    v.null(),
  ),
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

    const memberships = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_MEMBERS);

    const members = [];
    for (const member of memberships) {
      const user = await ctx.db.get(member.userId);
      if (user === null) continue;
      members.push({
        userId: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
        image: user.image ?? null,
        isViewer: user._id === userId,
      });
    }

    members.sort((a, b) => {
      const aKey = (a.name ?? a.email ?? a.userId).toLowerCase();
      const bKey = (b.name ?? b.email ?? b.userId).toLowerCase();
      return aKey.localeCompare(bKey, "sv");
    });

    return members;
  },
});

export const addMemberByEmail = mutation({
  args: {
    roomId: v.id("rooms"),
    email: v.string(),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const room = await ctx.db.get(args.roomId);
    if (room === null) {
      throw new Error("Rummet hittades inte");
    }

    const email = normalizeEmail(args.email);

    const existingMembers = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_MEMBERS);

    if (existingMembers.length >= MAX_MEMBERS) {
      throw new Error(`Rummet får ha högst ${MAX_MEMBERS} medlemmar`);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();

    if (user === null) {
      throw new Error("Ingen användare med den e-postadressen hittades");
    }

    const alreadyMember = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", user._id).eq("roomId", args.roomId),
      )
      .unique();

    if (alreadyMember !== null) {
      throw new Error("Användaren är redan medlem i rummet");
    }

    await ctx.db.insert("roomMembers", {
      roomId: args.roomId,
      userId: user._id,
    });

    return user._id;
  },
});

export const removeMember = mutation({
  args: {
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", args.userId).eq("roomId", args.roomId),
      )
      .unique();

    if (membership === null) {
      throw new Error("Användaren är inte medlem i rummet");
    }

    const memberCount = (
      await ctx.db
        .query("roomMembers")
        .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
        .take(MAX_MEMBERS)
    ).length;

    if (memberCount <= 1) {
      throw new Error("Du kan inte ta bort den sista medlemmen i rummet");
    }

    await ctx.db.delete(membership._id);
    return null;
  },
});
