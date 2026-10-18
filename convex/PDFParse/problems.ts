import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  lumoParsedProblemValidator,
  lumoStaticDocumentValidator,
  serializeStaticDocumentForPrompt,
  type LumoParsedProblem,
} from "../lib/lumoContent";
import { MAX_FILES_PER_ROOM } from "../lib/roomFiles";
import { requireRoomMember } from "../lib/roomAuth";
import { internalMutation, internalQuery, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Upper bound of problems expected from a single PDF. */
const MAX_PROBLEMS_PER_PDF = 500;

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

/**
 * All parsed problems in a room, grouped by source file.
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

      if (rows.length === 0) {
        continue;
      }

      const problems = rows
        .map((row) => ({
          id: row._id,
          problemNumber: row.problemNumber,
        }))
        .sort((a, b) => compareProblemNumbers(a.problemNumber, b.problemNumber));

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
  fileId: v.id("files"),
  fileName: v.string(),
  problem: lumoParsedProblemValidator,
});

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

    const file = files.find((f) => f.contentHash === row.contentHash);
    if (file === undefined) {
      return null;
    }

    return {
      id: row._id,
      fileId: file._id,
      fileName: file.name,
      problem: {
        problemNumber: row.problemNumber,
        question: row.problem,
        answer: row.answer,
      } satisfies LumoParsedProblem,
    };
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

    const fileByHash = new Map(
      files.map((file) => [file.contentHash, file] as const),
    );

    const results = [];
    for (const problemId of ids) {
      const row = await ctx.db.get(problemId);
      if (row === null) continue;
      const file = fileByHash.get(row.contentHash);
      if (file === undefined) continue;
      results.push({
        id: row._id,
        fileId: file._id,
        fileName: file.name,
        problem: {
          problemNumber: row.problemNumber,
          question: row.problem,
          answer: row.answer,
        } satisfies LumoParsedProblem,
      });
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

    if (rows.length === 0) {
      return null;
    }

    return rows.map(
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
    const fileByHash = new Map(
      files.map((file) => [file.contentHash, file] as const),
    );

    const results = [];
    for (const problemId of ids) {
      const row = await ctx.db.get(problemId);
      if (row === null) continue;
      if (!fileByHash.has(row.contentHash)) continue;
      results.push({
        problemNumber: row.problemNumber,
        questionText: serializeStaticDocumentForPrompt(row.problem),
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
    return rows.length;
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
