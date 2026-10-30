import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireRoomMember } from "./lib/roomAuth";
import { deleteStorageIfUnreferenced } from "./lib/storageRefs";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MAX_FIELD_LENGTH = 50;
const MAX_GENERAL_INFO_LENGTH = 4000;
const MAX_ROOMS = 100;
const MAX_MEMBERS = 100;
const DELETE_BATCH = 40;
const MAX_PDF_INFO_IN_USE = 50;

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
  clonedFromTemplateId: v.union(v.id("roomTemplates"), v.null()),
  templateExpired: v.boolean(),
  replacementTemplate: v.union(
    v.object({
      _id: v.id("roomTemplates"),
      name: v.string(),
    }),
    v.null(),
  ),
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
      const room = await ctx.db.get("rooms", membership.roomId);
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

    const room = await ctx.db.get("rooms", args.roomId);
    if (room === null) {
      return null;
    }

    let templateExpired = false;
    let replacementTemplate: {
      _id: Id<"roomTemplates">;
      name: string;
    } | null = null;

    if (room.clonedFromTemplateId !== undefined) {
      const template = await ctx.db.get("roomTemplates", room.clonedFromTemplateId);
      if (template !== null && template.status === "expired") {
        templateExpired = true;
        if (template.replacementTemplateId !== undefined) {
          const replacement = await ctx.db.get("roomTemplates", template.replacementTemplateId);
          if (replacement !== null && replacement.status === "published") {
            replacementTemplate = {
              _id: replacement._id,
              name: replacement.name,
            };
          }
        }
      }
    }

    return {
      _id: room._id,
      _creationTime: room._creationTime,
      name: room.name,
      description: room.description,
      generalInfo: room.generalInfo ?? "",
      clonedFromTemplateId: room.clonedFromTemplateId ?? null,
      templateExpired,
      replacementTemplate,
    };
  },
});

/**
 * Room + in-use PDF method notes for the chat agent system prompt.
 * No auth — internal only (called from roomAgent.generateResponse).
 */
export const getChatContext = internalQuery({
  args: { roomId: v.id("rooms") },
  returns: v.union(
    v.object({
      name: v.string(),
      description: v.string(),
      generalInfo: v.string(),
      pdfInfos: v.array(v.object({ text: v.string() })),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const room = await ctx.db.get("rooms", args.roomId);
    if (room === null) {
      return null;
    }

    const links = await ctx.db
      .query("cellsInUseByRoom")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_PDF_INFO_IN_USE);

    const pdfInfos: Array<{ text: string }> = [];
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
      const text = info.text.trim();
      if (text.length === 0) {
        continue;
      }
      pdfInfos.push({ text });
    }

    return {
      name: room.name,
      description: room.description,
      generalInfo: room.generalInfo ?? "",
      pdfInfos,
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

    const memberships = await ctx.db
      .query("roomMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_ROOMS);
    if (memberships.length >= MAX_ROOMS) {
      throw new Error(`Du får ha högst ${MAX_ROOMS} rum`);
    }

    const name = trimField(args.name, "Namn");
    const description = trimField(args.description, "Beskrivning");

    const roomId = await ctx.db.insert("rooms", {
      name,
      description,
      createdBy: userId,
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

    const room = await ctx.db.get("rooms", args.roomId);
    if (room === null) {
      throw new Error("Rummet hittades inte");
    }

    const name = trimField(args.name, "Namn");
    const description = trimField(args.description, "Beskrivning");
    const generalInfo = normalizeGeneralInfo(args.generalInfo);

    await ctx.db.patch("rooms", args.roomId, { name, description, generalInfo });
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
      const user = await ctx.db.get("users", member.userId);
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

    const room = await ctx.db.get("rooms", args.roomId);
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

    await ctx.db.delete("roomMembers", membership._id);
    return null;
  },
});

/**
 * Delete a room the caller belongs to. Cascades room-scoped data in batches.
 * Does not delete global problems/pdfInfo/mineruCache or published templates.
 */
export const remove = mutation({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const room = await ctx.db.get("rooms", args.roomId);
    if (room === null) {
      throw new Error("Rummet hittades inte");
    }

    // Drop memberships first so the room disappears from lists immediately.
    const members = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_MEMBERS);
    for (const member of members) {
      await ctx.db.delete("roomMembers", member._id);
    }

    await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
      roomId: args.roomId,
      phase: "threads",
    });
    return null;
  },
});

export const deleteCascade = internalMutation({
  args: {
    roomId: v.id("rooms"),
    phase: v.union(
      v.literal("threads"),
      v.literal("shadows"),
      v.literal("files"),
      v.literal("cells"),
      v.literal("jobs"),
      v.literal("scans"),
      v.literal("members"),
      v.literal("room"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { roomId, phase } = args;

    if (phase === "threads") {
      const threads = await ctx.db
        .query("roomThreads")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .take(DELETE_BATCH);
      for (const thread of threads) {
        await ctx.db.delete("roomThreads", thread._id);
      }
      if (threads.length === DELETE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
          roomId,
          phase: "threads",
        });
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
        roomId,
        phase: "shadows",
      });
      return null;
    }

    if (phase === "shadows") {
      // Prefix on by_room_and_parent: all shadows for this room.
      const shadows = await ctx.db
        .query("problems")
        .withIndex("by_room_and_parent", (q) => q.eq("roomId", roomId))
        .take(DELETE_BATCH);
      for (const shadow of shadows) {
        await ctx.db.delete("problems", shadow._id);
      }
      if (shadows.length === DELETE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
          roomId,
          phase: "shadows",
        });
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
        roomId,
        phase: "files",
      });
      return null;
    }

    if (phase === "files") {
      const files = await ctx.db
        .query("files")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .take(DELETE_BATCH);
      for (const file of files) {
        await ctx.db.delete("files", file._id);
        await deleteStorageIfUnreferenced(
          ctx,
          file.storageId,
          file.contentHash,
        );
      }
      if (files.length === DELETE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
          roomId,
          phase: "files",
        });
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
        roomId,
        phase: "cells",
      });
      return null;
    }

    if (phase === "cells") {
      const cells = await ctx.db
        .query("cellsInUseByRoom")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .take(DELETE_BATCH);
      for (const cell of cells) {
        await ctx.db.delete("cellsInUseByRoom", cell._id);
      }
      if (cells.length === DELETE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
          roomId,
          phase: "cells",
        });
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
        roomId,
        phase: "jobs",
      });
      return null;
    }

    if (phase === "jobs") {
      const jobs = await ctx.db
        .query("pdfParseJobs")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .take(DELETE_BATCH);
      for (const job of jobs) {
        await ctx.db.delete("pdfParseJobs", job._id);
      }
      if (jobs.length === DELETE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
          roomId,
          phase: "jobs",
        });
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
        roomId,
        phase: "scans",
      });
      return null;
    }

    if (phase === "scans") {
      const scans = await ctx.db
        .query("scanSessions")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .take(DELETE_BATCH);
      for (const scan of scans) {
        await ctx.db.delete("scanSessions", scan._id);
      }
      if (scans.length === DELETE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
          roomId,
          phase: "scans",
        });
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
        roomId,
        phase: "members",
      });
      return null;
    }

    if (phase === "members") {
      const members = await ctx.db
        .query("roomMembers")
        .withIndex("by_room", (q) => q.eq("roomId", roomId))
        .take(DELETE_BATCH);
      for (const member of members) {
        await ctx.db.delete("roomMembers", member._id);
      }
      if (members.length === DELETE_BATCH) {
        await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
          roomId,
          phase: "members",
        });
        return null;
      }
      await ctx.scheduler.runAfter(0, internal.rooms.deleteCascade, {
        roomId,
        phase: "room",
      });
      return null;
    }

    // phase === "room"
    const room = await ctx.db.get("rooms", roomId);
    if (room !== null) {
      await ctx.db.delete("rooms", roomId);
    }
    return null;
  },
});
