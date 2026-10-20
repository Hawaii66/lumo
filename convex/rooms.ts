import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireRoomMember } from "./lib/roomAuth";
import { mutation, query } from "./_generated/server";

const MAX_FIELD_LENGTH = 50;
const MAX_GENERAL_INFO_LENGTH = 4000;
const MAX_ROOMS = 100;

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

export const updateGeneralInfo = mutation({
  args: {
    roomId: v.id("rooms"),
    generalInfo: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    const generalInfo = normalizeGeneralInfo(args.generalInfo);
    await ctx.db.patch(args.roomId, { generalInfo });
    return null;
  },
});
