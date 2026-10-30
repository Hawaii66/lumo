import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { MAX_FILES_PER_ROOM } from "./lib/roomFiles";
import { requireRoomMember } from "./lib/roomAuth";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MAX_ROOMS = 100;
const MAX_FIELD_LENGTH = 50;
const MAX_TEMPLATES_SEARCH = 30;
const MAX_INFO_CELLS = 200;
const MAX_TEMPLATES_PER_SOURCE = 50;

const templateSummaryValidator = v.object({
  _id: v.id("roomTemplates"),
  name: v.string(),
  description: v.string(),
  publishedAt: v.number(),
  publisherName: v.union(v.string(), v.null()),
  fileCount: v.number(),
});

export const publishFromRoom = mutation({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.id("roomTemplates"),
  handler: async (ctx, args) => {
    const userId = await requireRoomMember(ctx, args.roomId);

    const room = await ctx.db.get("rooms", args.roomId);
    if (room === null) {
      throw new Error("Rummet hittades inte");
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);

    const infoCells = await ctx.db
      .query("cellsInUseByRoom")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_INFO_CELLS);

    const templateId = await ctx.db.insert("roomTemplates", {
      sourceRoomId: args.roomId,
      publisherId: userId,
      name: room.name,
      description: room.description,
      generalInfo: room.generalInfo ?? "",
      status: "published",
      publishedAt: Date.now(),
    });

    for (const file of files) {
      await ctx.db.insert("roomTemplateFiles", {
        templateId,
        name: file.name,
        storageId: file.storageId,
        contentHash: file.contentHash,
      });
    }

    for (const cell of infoCells) {
      await ctx.db.insert("roomTemplateInfoCells", {
        templateId,
        contentHash: cell.contentHash,
      });
    }

    return templateId;
  },
});

export const setExpired = mutation({
  args: {
    templateId: v.id("roomTemplates"),
    replacementTemplateId: v.optional(v.id("roomTemplates")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const template = await ctx.db.get("roomTemplates", args.templateId);
    if (template === null) {
      throw new Error("Mallen hittades inte");
    }
    if (template.publisherId !== userId) {
      throw new Error("Bara utgivaren kan markera mallen som utgången");
    }
    if (template.status === "expired") {
      throw new Error("Mallen är redan utgången");
    }

    let replacementTemplateId: Id<"roomTemplates"> | undefined;
    if (args.replacementTemplateId !== undefined) {
      if (args.replacementTemplateId === args.templateId) {
        throw new Error("Ersättningsmallen kan inte vara samma mall");
      }
      const replacement = await ctx.db.get("roomTemplates", args.replacementTemplateId);
      if (replacement === null) {
        throw new Error("Ersättningsmallen hittades inte");
      }
      if (replacement.status !== "published") {
        throw new Error("Ersättningsmallen måste vara publicerad");
      }
      replacementTemplateId = args.replacementTemplateId;
    }

    await ctx.db.patch("roomTemplates", args.templateId, {
      status: "expired",
      ...(replacementTemplateId !== undefined
        ? { replacementTemplateId }
        : {}),
    });
    return null;
  },
});

export const search = query({
  args: {
    query: v.string(),
  },
  returns: v.array(templateSummaryValidator),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    const trimmed = args.query.trim();
    const rows =
      trimmed.length === 0
        ? await ctx.db
            .query("roomTemplates")
            .withIndex("by_status", (q) => q.eq("status", "published"))
            .order("desc")
            .take(MAX_TEMPLATES_SEARCH)
        : await ctx.db
            .query("roomTemplates")
            .withSearchIndex("search_name", (q) =>
              q.search("name", trimmed).eq("status", "published"),
            )
            .take(MAX_TEMPLATES_SEARCH);

    const results = [];
    for (const template of rows) {
      const publisher = await ctx.db.get("users", template.publisherId);
      const files = await ctx.db
        .query("roomTemplateFiles")
        .withIndex("by_template", (q) => q.eq("templateId", template._id))
        .take(MAX_FILES_PER_ROOM);
      results.push({
        _id: template._id,
        name: template.name,
        description: template.description,
        publishedAt: template.publishedAt,
        publisherName: publisher?.name ?? publisher?.email ?? null,
        fileCount: files.length,
      });
    }
    return results;
  },
});

export const get = query({
  args: {
    templateId: v.id("roomTemplates"),
  },
  returns: v.union(
    v.object({
      _id: v.id("roomTemplates"),
      name: v.string(),
      description: v.string(),
      generalInfo: v.string(),
      status: v.union(v.literal("published"), v.literal("expired")),
      publishedAt: v.number(),
      publisherName: v.union(v.string(), v.null()),
      sourceRoomId: v.id("rooms"),
      files: v.array(
        v.object({
          name: v.string(),
          contentHash: v.string(),
        }),
      ),
      infoCellCount: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const template = await ctx.db.get("roomTemplates", args.templateId);
    if (template === null) {
      return null;
    }

    const publisher = await ctx.db.get("users", template.publisherId);
    const files = await ctx.db
      .query("roomTemplateFiles")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .take(MAX_FILES_PER_ROOM);
    const infoCells = await ctx.db
      .query("roomTemplateInfoCells")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .take(MAX_INFO_CELLS);

    return {
      _id: template._id,
      name: template.name,
      description: template.description,
      generalInfo: template.generalInfo,
      status: template.status,
      publishedAt: template.publishedAt,
      publisherName: publisher?.name ?? publisher?.email ?? null,
      sourceRoomId: template.sourceRoomId,
      files: files.map((f) => ({
        name: f.name,
        contentHash: f.contentHash,
      })),
      infoCellCount: infoCells.length,
    };
  },
});

export const listBySourceRoom = query({
  args: {
    roomId: v.id("rooms"),
  },
  returns: v.union(
    v.array(
      v.object({
        _id: v.id("roomTemplates"),
        name: v.string(),
        description: v.string(),
        status: v.union(v.literal("published"), v.literal("expired")),
        publishedAt: v.number(),
        isPublisher: v.boolean(),
        fileCount: v.number(),
        replacementTemplateId: v.union(v.id("roomTemplates"), v.null()),
        replacementName: v.union(v.string(), v.null()),
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

    const templates = await ctx.db
      .query("roomTemplates")
      .withIndex("by_sourceRoom", (q) => q.eq("sourceRoomId", args.roomId))
      .order("desc")
      .take(MAX_TEMPLATES_PER_SOURCE);

    const results = [];
    for (const template of templates) {
      const files = await ctx.db
        .query("roomTemplateFiles")
        .withIndex("by_template", (q) => q.eq("templateId", template._id))
        .take(MAX_FILES_PER_ROOM);
      let replacementName: string | null = null;
      if (template.replacementTemplateId !== undefined) {
        const replacement = await ctx.db.get("roomTemplates", template.replacementTemplateId);
        replacementName = replacement?.name ?? null;
      }
      results.push({
        _id: template._id,
        name: template.name,
        description: template.description,
        status: template.status,
        publishedAt: template.publishedAt,
        isPublisher: template.publisherId === userId,
        fileCount: files.length,
        replacementTemplateId: template.replacementTemplateId ?? null,
        replacementName,
      });
    }
    return results;
  },
});

export const clone = mutation({
  args: {
    templateId: v.id("roomTemplates"),
  },
  returns: v.id("rooms"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad för att klona en mall");
    }

    const template = await ctx.db.get("roomTemplates", args.templateId);
    if (template === null) {
      throw new Error("Mallen hittades inte");
    }
    if (template.status !== "published") {
      throw new Error("Utgångna mallar kan inte klonas");
    }

    const memberships = await ctx.db
      .query("roomMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAX_ROOMS);
    if (memberships.length >= MAX_ROOMS) {
      throw new Error(`Du får ha högst ${MAX_ROOMS} rum`);
    }

    const templateFiles = await ctx.db
      .query("roomTemplateFiles")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .take(MAX_FILES_PER_ROOM);
    if (templateFiles.length > MAX_FILES_PER_ROOM) {
      throw new Error("Mallen har för många filer");
    }

    const name =
      template.name.length > MAX_FIELD_LENGTH
        ? template.name.slice(0, MAX_FIELD_LENGTH)
        : template.name;
    const description =
      template.description.length > MAX_FIELD_LENGTH
        ? template.description.slice(0, MAX_FIELD_LENGTH)
        : template.description;

    const roomId = await ctx.db.insert("rooms", {
      name,
      description,
      generalInfo: template.generalInfo,
      createdBy: userId,
      clonedFromTemplateId: args.templateId,
    });

    await ctx.db.insert("roomMembers", {
      roomId,
      userId,
    });

    for (const file of templateFiles) {
      await ctx.db.insert("files", {
        roomId,
        name: file.name,
        storageId: file.storageId,
        contentHash: file.contentHash,
      });
    }

    const infoCells = await ctx.db
      .query("roomTemplateInfoCells")
      .withIndex("by_template", (q) => q.eq("templateId", args.templateId))
      .take(MAX_INFO_CELLS);
    for (const cell of infoCells) {
      await ctx.db.insert("cellsInUseByRoom", {
        roomId,
        contentHash: cell.contentHash,
      });
    }

    return roomId;
  },
});
