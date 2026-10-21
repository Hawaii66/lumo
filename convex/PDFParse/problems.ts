import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  lumoParsedProblemValidator,
  lumoStaticDocumentValidator,
  serializeStaticDocumentForPrompt,
  type LumoParsedProblem,
} from "../lib/lumoContent";
import {
  fileForParsedProblem,
  isShadowProblem,
  problemVisibleInRoom,
} from "../lib/problemAccess";
import { MAX_FILES_PER_ROOM } from "../lib/roomFiles";
import { requireRoomMember } from "../lib/roomAuth";
import { internalMutation, internalQuery, query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Upper bound of problems expected from a single PDF. */
const MAX_PROBLEMS_PER_PDF = 500;
/** Upper bound of shadow twins per parent per room. */
export const MAX_SHADOWS_PER_PARENT = 20;

export { isShadowProblem, problemVisibleInRoom } from "../lib/problemAccess";

async function isRoomMember(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return false;
  }
  const membership = await ctx.db
    .query("roomMembers")
    .withIndex("by_user_and_room", (q) =>
      q.eq("userId", userId).eq("roomId", roomId),
    )
    .unique();
  return membership !== null;
}

function compareProblemNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

const problemRowValidator = v.object({
  problemNumber: v.string(),
  problem: lumoStaticDocumentValidator,
  answer: lumoStaticDocumentValidator,
});

const shadowListItemValidator = v.object({
  id: v.id("problems"),
  problemNumber: v.string(),
});

/**
 * All parsed problems in a room, grouped by source file.
 * Room-scoped shadows are nested under their parent.
 * Files with no cached problems are omitted.
 */
export const listGroupedByRoom = query({
  args: { roomId: v.id("rooms") },
  returns: v.array(
    v.object({
      fileId: v.id("files"),
      fileName: v.string(),
      problems: v.array(
        v.object({
          id: v.id("problems"),
          problemNumber: v.string(),
          shadows: v.array(shadowListItemValidator),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return [];
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(MAX_FILES_PER_ROOM);

    const groups = [];
    for (const file of files) {
      const rows = await ctx.db
        .query("problems")
        .withIndex("by_contentHash", (q) =>
          q.eq("contentHash", file.contentHash),
        )
        .take(MAX_PROBLEMS_PER_PDF);

      // Skip shadow rows that somehow got a contentHash (shouldn't happen).
      const parsed = rows.filter((row) => !isShadowProblem(row));
      if (parsed.length === 0) {
        continue;
      }

      const problems = [];
      for (const row of parsed.sort((a, b) =>
        compareProblemNumbers(a.problemNumber, b.problemNumber),
      )) {
        const shadows = await ctx.db
          .query("problems")
          .withIndex("by_room_and_parent", (q) =>
            q.eq("roomId", args.roomId).eq("parentProblemId", row._id),
          )
          .take(MAX_SHADOWS_PER_PARENT);

        problems.push({
          id: row._id,
          problemNumber: row.problemNumber,
          shadows: shadows
            .map((s) => ({
              id: s._id,
              problemNumber: s.problemNumber,
            }))
            .sort((a, b) =>
              compareProblemNumbers(a.problemNumber, b.problemNumber),
            ),
        });
      }

      groups.push({
        fileId: file._id,
        fileName: file.name,
        problems,
      });
    }

    return groups;
  },
});

const roomProblemResultValidator = v.object({
  id: v.id("problems"),
  fileId: v.union(v.id("files"), v.null()),
  fileName: v.string(),
  isShadow: v.boolean(),
  parentProblemId: v.union(v.id("problems"), v.null()),
  parentProblemNumber: v.union(v.string(), v.null()),
  problem: lumoParsedProblemValidator,
});

async function resolveRoomProblem(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  row: Doc<"problems">,
  roomFiles: Array<Doc<"files">>,
): Promise<{
  id: Id<"problems">;
  fileId: Id<"files"> | null;
  fileName: string;
  isShadow: boolean;
  parentProblemId: Id<"problems"> | null;
  parentProblemNumber: string | null;
  problem: LumoParsedProblem;
} | null> {
  if (!problemVisibleInRoom(row, roomId, roomFiles)) {
    return null;
  }

  const shadow = isShadowProblem(row);
  let fileId: Id<"files"> | null = null;
  let fileName = "Tvilling";
  let parentProblemNumber: string | null = null;

  if (shadow && row.parentProblemId !== undefined) {
    const parent = await ctx.db.get(row.parentProblemId);
    if (parent !== null) {
      parentProblemNumber = parent.problemNumber;
      const parentFile = fileForParsedProblem(parent, roomFiles);
      if (parentFile !== undefined) {
        fileId = parentFile._id;
        fileName = parentFile.name;
      }
    }
  } else {
    const file = fileForParsedProblem(row, roomFiles);
    if (file === undefined) {
      return null;
    }
    fileId = file._id;
    fileName = file.name;
  }

  return {
    id: row._id,
    fileId,
    fileName,
    isShadow: shadow,
    parentProblemId: row.parentProblemId ?? null,
    parentProblemNumber,
    problem: {
      problemNumber: row.problemNumber,
      question: row.problem,
      answer: row.answer,
    } satisfies LumoParsedProblem,
  };
}

/** Single problem for room detail view; null if missing or not in this room. */
export const getForRoom = query({
  args: {
    roomId: v.id("rooms"),
    problemId: v.id("problems"),
  },
  returns: v.union(roomProblemResultValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return null;
    }

    const row = await ctx.db.get(args.problemId);
    if (row === null) {
      return null;
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);

    return await resolveRoomProblem(ctx, args.roomId, row, files);
  },
});

const MAX_PROBLEMS_PER_GET_MANY = 20;

/** Several problems for chat embeds; preserves request order, skips missing. */
export const getManyForRoom = query({
  args: {
    roomId: v.id("rooms"),
    problemIds: v.array(v.id("problems")),
  },
  returns: v.array(roomProblemResultValidator),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return [];
    }

    const ids = args.problemIds.slice(0, MAX_PROBLEMS_PER_GET_MANY);
    if (ids.length === 0) {
      return [];
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);

    const results = [];
    for (const problemId of ids) {
      const row = await ctx.db.get(problemId);
      if (row === null) continue;
      const resolved = await resolveRoomProblem(ctx, args.roomId, row, files);
      if (resolved !== null) {
        results.push(resolved);
      }
    }
    return results;
  },
});

/**
 * Resolve file id → contentHash → cached problems.
 * Null when the file is missing or has no saved problems.
 */
export const listByFileId = query({
  args: { fileId: v.id("files") },
  returns: v.union(v.array(lumoParsedProblemValidator), v.null()),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (file === null) {
      return null;
    }
    await requireRoomMember(ctx, file.roomId);

    const rows = await ctx.db
      .query("problems")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", file.contentHash))
      .take(MAX_PROBLEMS_PER_PDF);

    const parsed = rows.filter((r) => !isShadowProblem(r));
    if (parsed.length === 0) {
      return null;
    }

    return parsed.map(
      (r): LumoParsedProblem => ({
        problemNumber: r.problemNumber,
        question: r.problem,
        answer: r.answer,
      }),
    );
  },
});

/**
 * Problem texts for the room agent. Skips ids that are missing or not in room.
 */
export const getPromptContexts = internalQuery({
  args: {
    roomId: v.id("rooms"),
    problemIds: v.array(v.id("problems")),
  },
  returns: v.array(
    v.object({
      problemNumber: v.string(),
      questionText: v.string(),
      answerText: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const ids = args.problemIds.slice(0, MAX_PROBLEMS_PER_GET_MANY);
    if (ids.length === 0) {
      return [];
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);

    const results = [];
    for (const problemId of ids) {
      const row = await ctx.db.get(problemId);
      if (row === null) continue;
      if (!problemVisibleInRoom(row, args.roomId, files)) continue;
      results.push({
        problemNumber: row.problemNumber,
        questionText: serializeStaticDocumentForPrompt(row.problem),
        answerText: serializeStaticDocumentForPrompt(row.answer),
      });
    }
    return results;
  },
});

/** Count cached problems for a content hash (no auth — internal only). */
export const countByContentHash = internalQuery({
  args: { contentHash: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("problems")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", args.contentHash))
      .take(MAX_PROBLEMS_PER_PDF);
    return rows.filter((r) => !isShadowProblem(r)).length;
  },
});

/** Parent + room visibility for shadow creation (internal). */
export const getParentForShadow = internalQuery({
  args: {
    roomId: v.id("rooms"),
    parentProblemId: v.id("problems"),
  },
  returns: v.union(
    v.object({
      parentProblemId: v.id("problems"),
      parentProblemNumber: v.string(),
      questionText: v.string(),
      answerText: v.string(),
      existingShadowCount: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentProblemId);
    if (parent === null) {
      return null;
    }
    if (isShadowProblem(parent)) {
      return null;
    }
    if (parent.contentHash === undefined) {
      return null;
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);

    if (!problemVisibleInRoom(parent, args.roomId, files)) {
      return null;
    }

    const shadows = await ctx.db
      .query("problems")
      .withIndex("by_room_and_parent", (q) =>
        q.eq("roomId", args.roomId).eq("parentProblemId", parent._id),
      )
      .take(MAX_SHADOWS_PER_PARENT);

    return {
      parentProblemId: parent._id,
      parentProblemNumber: parent.problemNumber,
      questionText: serializeStaticDocumentForPrompt(parent.problem),
      answerText: serializeStaticDocumentForPrompt(parent.answer),
      existingShadowCount: shadows.length,
    };
  },
});

/** Insert a room-scoped shadow twin under a parsed parent. */
export const insertShadow = internalMutation({
  args: {
    roomId: v.id("rooms"),
    parentProblemId: v.id("problems"),
    problemNumber: v.string(),
    problem: lumoStaticDocumentValidator,
    answer: lumoStaticDocumentValidator,
  },
  returns: v.id("problems"),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentProblemId);
    if (parent === null) {
      throw new Error("Uppgiften hittades inte");
    }
    if (isShadowProblem(parent)) {
      throw new Error("Kan inte skapa tvilling från en tvilling");
    }
    if (parent.contentHash === undefined) {
      throw new Error("Uppgiften saknar källa");
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    if (!problemVisibleInRoom(parent, args.roomId, files)) {
      throw new Error("Uppgiften tillhör inte det här rummet");
    }

    const existing = await ctx.db
      .query("problems")
      .withIndex("by_room_and_parent", (q) =>
        q
          .eq("roomId", args.roomId)
          .eq("parentProblemId", args.parentProblemId),
      )
      .take(MAX_SHADOWS_PER_PARENT);
    if (existing.length >= MAX_SHADOWS_PER_PARENT) {
      throw new Error(
        `Högst ${MAX_SHADOWS_PER_PARENT} tvillingar per uppgift`,
      );
    }

    return await ctx.db.insert("problems", {
      roomId: args.roomId,
      parentProblemId: args.parentProblemId,
      problemNumber: args.problemNumber,
      problem: args.problem,
      answer: args.answer,
    });
  },
});

/** Replace all problems for a content hash (delete existing, insert new rows). */
export const replaceForContentHash = internalMutation({
  args: {
    contentHash: v.string(),
    problems: v.array(problemRowValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("problems")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", args.contentHash))
      .take(MAX_PROBLEMS_PER_PDF);

    for (const row of existing) {
      // Cascade-delete room-scoped shadows of this parent (all rooms).
      const shadows = await ctx.db
        .query("problems")
        .withIndex("by_parent", (q) => q.eq("parentProblemId", row._id))
        .take(MAX_SHADOWS_PER_PARENT * 50);
      for (const shadow of shadows) {
        await ctx.db.delete(shadow._id);
      }
      await ctx.db.delete(row._id);
    }

    for (const problem of args.problems) {
      await ctx.db.insert("problems", {
        contentHash: args.contentHash,
        problemNumber: problem.problemNumber,
        problem: problem.problem,
        answer: problem.answer,
      });
    }

    return null;
  },
});
