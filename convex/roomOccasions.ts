import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  isShadowProblem,
  problemVisibleInRoom,
} from "./lib/problemAccess";
import { MAX_FILES_PER_ROOM } from "./lib/roomFiles";
import { requireRoomMember } from "./lib/roomAuth";
import {
  hasSubproblemHeadings,
  listSubproblemLetters,
  normalizeSubproblemLetter,
} from "./lib/subproblemSlice";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MAX_OCCASIONS_PER_ROOM = 100;
const MAX_ASSIGNMENTS_PER_ROOM = 500 * MAX_FILES_PER_ROOM * 26;
const MAX_ASSIGNMENTS_PER_OCCASION = 2000;
const MAX_PROBLEMS_PER_PDF = 500;
const MAX_NAME_LENGTH = 80;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const assignmentUnitValidator = v.object({
  contentHash: v.string(),
  problemNumber: v.string(),
  subproblemLetter: v.string(),
});

const occasionAssignmentValidator = v.object({
  contentHash: v.string(),
  problemNumber: v.string(),
  subproblemLetter: v.string(),
  problemId: v.union(v.id("problems"), v.null()),
  fileName: v.union(v.string(), v.null()),
  label: v.string(),
});

const occasionValidator = v.object({
  _id: v.id("roomOccasions"),
  name: v.string(),
  date: v.string(),
  sortOrder: v.union(v.number(), v.null()),
  label: v.string(),
  assignments: v.array(occasionAssignmentValidator),
});

const assignableUnitValidator = v.object({
  contentHash: v.string(),
  problemNumber: v.string(),
  subproblemLetter: v.string(),
  problemId: v.id("problems"),
  fileId: v.id("files"),
  fileName: v.string(),
  label: v.string(),
  occasionId: v.union(v.id("roomOccasions"), v.null()),
  occasionName: v.union(v.string(), v.null()),
  starEntries: v.array(
    v.object({
      letter: v.string(),
      stars: v.union(v.literal(1), v.literal(2), v.literal(3)),
    }),
  ),
  completionEntries: v.array(v.object({ letter: v.string() })),
});

async function isRoomMember(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
): Promise<boolean> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return false;
  const membership = await ctx.db
    .query("roomMembers")
    .withIndex("by_user_and_room", (q) =>
      q.eq("userId", userId).eq("roomId", roomId),
    )
    .unique();
  return membership !== null;
}

function normalizeStoredLetter(letter: string | undefined): string {
  return normalizeSubproblemLetter(letter) ?? "";
}

function unitLabel(problemNumber: string, subproblemLetter: string): string {
  return subproblemLetter.length > 0
    ? `${problemNumber}${subproblemLetter}`
    : problemNumber;
}

/** Display helper: "Lektion 3 (30/11)" from name + YYYY-MM-DD. */
export function formatOccasionLabel(name: string, date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match === null) return name;
  const day = Number(match[3]);
  const month = Number(match[2]);
  return `${name} (${day}/${month})`;
}

function assertValidDate(date: string): string {
  const trimmed = date.trim();
  if (!DATE_RE.test(trimmed)) {
    throw new Error("Datum måste vara YYYY-MM-DD");
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month! - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Ogiltigt datum");
  }
  return trimmed;
}

function assertValidName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("Namn får inte vara tomt");
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`Namn får vara högst ${MAX_NAME_LENGTH} tecken`);
  }
  return trimmed;
}

function compareOccasions(
  a: { date: string; sortOrder?: number; name: string },
  b: { date: string; sortOrder?: number; name: string },
): number {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  const aOrder = a.sortOrder;
  const bOrder = b.sortOrder;
  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if (aOrder !== undefined && bOrder === undefined) return -1;
  if (aOrder === undefined && bOrder !== undefined) return 1;
  return a.name.localeCompare(b.name, "sv");
}

function compareProblemNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareUnits(
  a: {
    problemNumber: string;
    subproblemLetter: string;
    fileName?: string | null;
    sortOrder?: number | null;
  },
  b: {
    problemNumber: string;
    subproblemLetter: string;
    fileName?: string | null;
    sortOrder?: number | null;
  },
): number {
  const aOrder = a.sortOrder ?? undefined;
  const bOrder = b.sortOrder ?? undefined;
  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if (aOrder !== undefined && bOrder === undefined) return -1;
  if (aOrder === undefined && bOrder !== undefined) return 1;
  const fileCmp = (a.fileName ?? "").localeCompare(b.fileName ?? "", "sv");
  if (fileCmp !== 0) return fileCmp;
  const numCmp = compareProblemNumbers(a.problemNumber, b.problemNumber);
  if (numCmp !== 0) return numCmp;
  return a.subproblemLetter.localeCompare(b.subproblemLetter);
}

async function nextSortOrderForOccasion(
  ctx: MutationCtx,
  occasionId: Id<"roomOccasions">,
): Promise<number> {
  const rows = await ctx.db
    .query("roomOccasionAssignments")
    .withIndex("by_occasion", (q) => q.eq("occasionId", occasionId))
    .take(MAX_ASSIGNMENTS_PER_OCCASION);
  let max = -1;
  for (const row of rows) {
    if (row.sortOrder !== undefined && row.sortOrder > max) {
      max = row.sortOrder;
    }
  }
  return max + 1;
}

async function loadArchivedContentHashes(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
): Promise<Set<string>> {
  const rows = await ctx.db
    .query("problemsArchivedByRoom")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_FILES_PER_ROOM);
  return new Set(rows.map((row) => row.contentHash));
}

async function findAssignment(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
  contentHash: string,
  problemNumber: string,
  subproblemLetter: string,
) {
  return await ctx.db
    .query("roomOccasionAssignments")
    .withIndex(
      "by_room_and_contentHash_and_problemNumber_and_subproblemLetter",
      (q) =>
        q
          .eq("roomId", roomId)
          .eq("contentHash", contentHash)
          .eq("problemNumber", problemNumber)
          .eq("subproblemLetter", subproblemLetter),
    )
    .unique();
}

function normalizeUnitArgs(args: {
  contentHash: string;
  problemNumber: string;
  subproblemLetter?: string;
}): {
  contentHash: string;
  problemNumber: string;
  subproblemLetter: string;
} {
  const contentHash = args.contentHash.trim();
  const problemNumber = args.problemNumber.trim();
  if (contentHash.length === 0 || problemNumber.length === 0) {
    throw new Error("Ogiltig uppgift");
  }
  const letter =
    args.subproblemLetter === undefined || args.subproblemLetter.trim() === ""
      ? ""
      : normalizeSubproblemLetter(args.subproblemLetter);
  if (letter === null) {
    throw new Error("Ogiltig deluppgift");
  }
  return { contentHash, problemNumber, subproblemLetter: letter };
}

export const listByRoom = query({
  args: { roomId: v.id("rooms") },
  returns: v.array(occasionValidator),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return [];
    }

    const occasions = await ctx.db
      .query("roomOccasions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_OCCASIONS_PER_ROOM);
    occasions.sort(compareOccasions);

    const assignmentRows = await ctx.db
      .query("roomOccasionAssignments")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_ASSIGNMENTS_PER_ROOM);

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    const fileNameByHash = new Map<string, string>();
    for (const file of files) {
      if (!fileNameByHash.has(file.contentHash)) {
        fileNameByHash.set(file.contentHash, file.name);
      }
    }

    const problemIdByKey = new Map<string, Id<"problems">>();
    for (const hash of new Set(files.map((file) => file.contentHash))) {
      const rows = await ctx.db
        .query("problems")
        .withIndex("by_contentHash", (q) => q.eq("contentHash", hash))
        .take(MAX_PROBLEMS_PER_PDF);
      for (const row of rows) {
        if (isShadowProblem(row)) continue;
        problemIdByKey.set(`${hash}\0${row.problemNumber}`, row._id);
      }
    }

    const byOccasion = new Map<
      Id<"roomOccasions">,
      Array<{
        contentHash: string;
        problemNumber: string;
        subproblemLetter: string;
        problemId: Id<"problems"> | null;
        fileName: string | null;
        label: string;
        sortOrder: number | null;
      }>
    >();
    for (const row of assignmentRows) {
      const letter = normalizeStoredLetter(row.subproblemLetter);
      const list = byOccasion.get(row.occasionId) ?? [];
      list.push({
        contentHash: row.contentHash,
        problemNumber: row.problemNumber,
        subproblemLetter: letter,
        problemId:
          problemIdByKey.get(`${row.contentHash}\0${row.problemNumber}`) ??
          null,
        fileName: fileNameByHash.get(row.contentHash) ?? null,
        label: unitLabel(row.problemNumber, letter),
        sortOrder: row.sortOrder ?? null,
      });
      byOccasion.set(row.occasionId, list);
    }
    for (const list of byOccasion.values()) {
      list.sort(compareUnits);
    }

    return occasions.map((occasion) => ({
      _id: occasion._id,
      name: occasion.name,
      date: occasion.date,
      sortOrder: occasion.sortOrder ?? null,
      label: formatOccasionLabel(occasion.name, occasion.date),
      assignments: (byOccasion.get(occasion._id) ?? []).map(
        ({ sortOrder: _sortOrder, ...assignment }) => assignment,
      ),
    }));
  },
});

export const listAssignableUnits = query({
  args: { roomId: v.id("rooms") },
  returns: v.array(assignableUnitValidator),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return [];
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);

    const occasions = await ctx.db
      .query("roomOccasions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_OCCASIONS_PER_ROOM);
    const occasionNameById = new Map(
      occasions.map((row) => [row._id, row.name] as const),
    );

    const assignmentRows = await ctx.db
      .query("roomOccasionAssignments")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_ASSIGNMENTS_PER_ROOM);
    const occasionByUnit = new Map<string, Id<"roomOccasions">>();
    for (const row of assignmentRows) {
      const letter = normalizeStoredLetter(row.subproblemLetter);
      occasionByUnit.set(
        `${row.contentHash}\0${row.problemNumber}\0${letter}`,
        row.occasionId,
      );
    }

    const starRows = await ctx.db
      .query("roomProblemStars")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_ASSIGNMENTS_PER_ROOM);
    const starsByProblem = new Map<
      string,
      Array<{ letter: string; stars: 1 | 2 | 3 }>
    >();
    for (const row of starRows) {
      const letter = normalizeStoredLetter(row.subproblemLetter);
      const key = `${row.contentHash}\0${row.problemNumber}`;
      const list = starsByProblem.get(key) ?? [];
      list.push({ letter, stars: row.stars });
      starsByProblem.set(key, list);
    }

    const completionRows = await ctx.db
      .query("roomProblemCompletions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_ASSIGNMENTS_PER_ROOM);
    const completionsByProblem = new Map<string, Array<{ letter: string }>>();
    for (const row of completionRows) {
      const letter = normalizeStoredLetter(row.subproblemLetter);
      const key = `${row.contentHash}\0${row.problemNumber}`;
      const list = completionsByProblem.get(key) ?? [];
      list.push({ letter });
      completionsByProblem.set(key, list);
    }

    const units: Array<{
      contentHash: string;
      problemNumber: string;
      subproblemLetter: string;
      problemId: Id<"problems">;
      fileId: Id<"files">;
      fileName: string;
      label: string;
      occasionId: Id<"roomOccasions"> | null;
      occasionName: string | null;
      starEntries: Array<{ letter: string; stars: 1 | 2 | 3 }>;
      completionEntries: Array<{ letter: string }>;
    }> = [];

    const seenHashes = new Set<string>();
    const orderedFiles = [...files].sort((a, b) => {
      const aOrder = a.problemSortOrder;
      const bOrder = b.problemSortOrder;
      if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      if (aOrder !== undefined && bOrder === undefined) return -1;
      if (aOrder === undefined && bOrder !== undefined) return 1;
      return a.name.localeCompare(b.name, "sv");
    });

    for (const file of orderedFiles) {
      if (archivedHashes.has(file.contentHash)) continue;
      if (seenHashes.has(file.contentHash)) continue;
      seenHashes.add(file.contentHash);

      const problems = await ctx.db
        .query("problems")
        .withIndex("by_contentHash", (q) =>
          q.eq("contentHash", file.contentHash),
        )
        .take(MAX_PROBLEMS_PER_PDF);
      const parsed = problems
        .filter((row) => !isShadowProblem(row))
        .sort((a, b) => compareProblemNumbers(a.problemNumber, b.problemNumber));

      for (const problem of parsed) {
        const letters = listSubproblemLetters(problem.problem);
        const problemKey = `${file.contentHash}\0${problem.problemNumber}`;
        const starEntries = starsByProblem.get(problemKey) ?? [];
        const completionEntries = completionsByProblem.get(problemKey) ?? [];
        const unitLetters = letters.length > 0 ? letters : [""];

        for (const letter of unitLetters) {
          const unitKey = `${file.contentHash}\0${problem.problemNumber}\0${letter}`;
          const occasionId = occasionByUnit.get(unitKey) ?? null;
          units.push({
            contentHash: file.contentHash,
            problemNumber: problem.problemNumber,
            subproblemLetter: letter,
            problemId: problem._id,
            fileId: file._id,
            fileName: file.name,
            label: unitLabel(problem.problemNumber, letter),
            occasionId,
            occasionName:
              occasionId === null
                ? null
                : (occasionNameById.get(occasionId) ?? null),
            starEntries,
            completionEntries,
          });
        }
      }
    }

    return units;
  },
});

export const create = mutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
    date: v.string(),
    sortOrder: v.optional(v.number()),
  },
  returns: v.id("roomOccasions"),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    const name = assertValidName(args.name);
    const date = assertValidDate(args.date);

    const existing = await ctx.db
      .query("roomOccasions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_OCCASIONS_PER_ROOM);
    if (existing.length >= MAX_OCCASIONS_PER_ROOM) {
      throw new Error(`Högst ${MAX_OCCASIONS_PER_ROOM} tillfällen per rum`);
    }

    return await ctx.db.insert("roomOccasions", {
      roomId: args.roomId,
      name,
      date,
      ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
    });
  },
});

export const update = mutation({
  args: {
    occasionId: v.id("roomOccasions"),
    name: v.optional(v.string()),
    date: v.optional(v.string()),
    sortOrder: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const occasion = await ctx.db.get("roomOccasions", args.occasionId);
    if (occasion === null) {
      throw new Error("Tillfället hittades inte");
    }
    await requireRoomMember(ctx, occasion.roomId);

    const patch: {
      name?: string;
      date?: string;
      sortOrder?: number;
    } = {};
    if (args.name !== undefined) {
      patch.name = assertValidName(args.name);
    }
    if (args.date !== undefined) {
      patch.date = assertValidDate(args.date);
    }
    if (args.sortOrder === null) {
      // Clear sortOrder by replacing the document without it.
      await ctx.db.replace("roomOccasions", args.occasionId, {
        roomId: occasion.roomId,
        name: patch.name ?? occasion.name,
        date: patch.date ?? occasion.date,
      });
      return null;
    }
    if (args.sortOrder !== undefined) {
      patch.sortOrder = args.sortOrder;
    }
    if (Object.keys(patch).length > 0) {
      await ctx.db.patch("roomOccasions", args.occasionId, patch);
    }
    return null;
  },
});

export const remove = mutation({
  args: { occasionId: v.id("roomOccasions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const occasion = await ctx.db.get("roomOccasions", args.occasionId);
    if (occasion === null) {
      throw new Error("Tillfället hittades inte");
    }
    await requireRoomMember(ctx, occasion.roomId);

    const assignments = await ctx.db
      .query("roomOccasionAssignments")
      .withIndex("by_occasion", (q) => q.eq("occasionId", args.occasionId))
      .take(MAX_ASSIGNMENTS_PER_OCCASION);
    for (const row of assignments) {
      await ctx.db.delete("roomOccasionAssignments", row._id);
    }
    await ctx.db.delete("roomOccasions", args.occasionId);
    return null;
  },
});

export const setAssignment = mutation({
  args: {
    roomId: v.id("rooms"),
    occasionId: v.id("roomOccasions"),
    contentHash: v.string(),
    problemNumber: v.string(),
    subproblemLetter: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    const occasion = await ctx.db.get("roomOccasions", args.occasionId);
    if (occasion === null || occasion.roomId !== args.roomId) {
      throw new Error("Tillfället hittades inte");
    }

    const unit = normalizeUnitArgs(args);
    const existing = await findAssignment(
      ctx,
      args.roomId,
      unit.contentHash,
      unit.problemNumber,
      unit.subproblemLetter,
    );
    if (existing !== null) {
      if (existing.occasionId === args.occasionId) return null;
      const sortOrder = await nextSortOrderForOccasion(ctx, args.occasionId);
      await ctx.db.patch("roomOccasionAssignments", existing._id, {
        occasionId: args.occasionId,
        sortOrder,
      });
      return null;
    }

    const sortOrder = await nextSortOrderForOccasion(ctx, args.occasionId);
    await ctx.db.insert("roomOccasionAssignments", {
      roomId: args.roomId,
      occasionId: args.occasionId,
      contentHash: unit.contentHash,
      problemNumber: unit.problemNumber,
      subproblemLetter: unit.subproblemLetter,
      sortOrder,
    });
    return null;
  },
});

export const clearAssignment = mutation({
  args: {
    roomId: v.id("rooms"),
    contentHash: v.string(),
    problemNumber: v.string(),
    subproblemLetter: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    const unit = normalizeUnitArgs(args);
    const existing = await findAssignment(
      ctx,
      args.roomId,
      unit.contentHash,
      unit.problemNumber,
      unit.subproblemLetter,
    );
    if (existing !== null) {
      await ctx.db.delete("roomOccasionAssignments", existing._id);
    }
    return null;
  },
});

/**
 * Current tillfälle assignments for one problem (by deluppgift letter).
 * `letter` is `""` for whole-problem assignment when there are no deluppgifter.
 */
export const listEntriesForProblem = query({
  args: {
    roomId: v.id("rooms"),
    problemId: v.id("problems"),
  },
  returns: v.array(
    v.object({
      letter: v.string(),
      occasionId: v.id("roomOccasions"),
      occasionLabel: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return [];
    }

    const problem = await ctx.db.get("problems", args.problemId);
    if (
      problem === null ||
      isShadowProblem(problem) ||
      problem.contentHash === undefined
    ) {
      return [];
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);
    if (
      !problemVisibleInRoom(problem, args.roomId, files, archivedHashes)
    ) {
      return [];
    }

    const occasions = await ctx.db
      .query("roomOccasions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_OCCASIONS_PER_ROOM);
    const labelById = new Map(
      occasions.map(
        (row) =>
          [row._id, formatOccasionLabel(row.name, row.date)] as const,
      ),
    );

    const assignmentRows = await ctx.db
      .query("roomOccasionAssignments")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_ASSIGNMENTS_PER_ROOM);

    const entries: Array<{
      letter: string;
      occasionId: Id<"roomOccasions">;
      occasionLabel: string;
    }> = [];
    for (const row of assignmentRows) {
      if (
        row.contentHash !== problem.contentHash ||
        row.problemNumber !== problem.problemNumber
      ) {
        continue;
      }
      const letter = normalizeStoredLetter(row.subproblemLetter);
      const occasionLabel = labelById.get(row.occasionId);
      if (occasionLabel === undefined) continue;
      entries.push({
        letter,
        occasionId: row.occasionId,
        occasionLabel,
      });
    }
    entries.sort((a, b) => a.letter.localeCompare(b.letter));
    return entries;
  },
});

/**
 * Assign or clear a tillfälle for a problem unit (whole or deluppgift).
 * `occasionId: null` clears the assignment. Same letter rules as stars.
 */
export const setForProblem = mutation({
  args: {
    roomId: v.id("rooms"),
    problemId: v.id("problems"),
    occasionId: v.union(v.id("roomOccasions"), v.null()),
    subproblemLetter: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const problem = await ctx.db.get("problems", args.problemId);
    if (problem === null) {
      throw new Error("Uppgiften hittades inte");
    }
    if (isShadowProblem(problem)) {
      throw new Error("Tvillingar kan inte tilldelas tillfällen");
    }
    const contentHash = problem.contentHash;
    if (contentHash === undefined) {
      throw new Error("Uppgiften saknar källa");
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);
    if (
      !problemVisibleInRoom(problem, args.roomId, files, archivedHashes)
    ) {
      throw new Error("Uppgiften tillhör inte det här rummet");
    }

    const hasParts = hasSubproblemHeadings(problem.problem);
    let letter = "";
    if (hasParts) {
      const normalized = normalizeSubproblemLetter(args.subproblemLetter);
      if (normalized === null) {
        throw new Error("Ange deluppgift (a–z) för att tilldela");
      }
      letter = normalized;
    } else if (
      args.subproblemLetter !== undefined &&
      args.subproblemLetter.trim().length > 0
    ) {
      throw new Error("Uppgiften har inga deluppgifter");
    }

    if (args.occasionId === null) {
      const existing = await findAssignment(
        ctx,
        args.roomId,
        contentHash,
        problem.problemNumber,
        letter,
      );
      if (existing !== null) {
        await ctx.db.delete("roomOccasionAssignments", existing._id);
      }
      return null;
    }

    const occasion = await ctx.db.get("roomOccasions", args.occasionId);
    if (occasion === null || occasion.roomId !== args.roomId) {
      throw new Error("Tillfället hittades inte");
    }

    const existing = await findAssignment(
      ctx,
      args.roomId,
      contentHash,
      problem.problemNumber,
      letter,
    );
    if (existing !== null) {
      if (existing.occasionId === args.occasionId) return null;
      const sortOrder = await nextSortOrderForOccasion(ctx, args.occasionId);
      await ctx.db.patch("roomOccasionAssignments", existing._id, {
        occasionId: args.occasionId,
        sortOrder,
      });
      return null;
    }

    const sortOrder = await nextSortOrderForOccasion(ctx, args.occasionId);
    await ctx.db.insert("roomOccasionAssignments", {
      roomId: args.roomId,
      occasionId: args.occasionId,
      contentHash,
      problemNumber: problem.problemNumber,
      subproblemLetter: letter,
      sortOrder,
    });
    return null;
  },
});

const MAX_BULK_ASSIGN_UNITS = 100;

const bulkAssignUnitValidator = v.object({
  problemId: v.id("problems"),
  subproblemLetter: v.optional(v.string()),
});

/**
 * Mass-assign star level and tillfälle for many problem units in one mutation.
 * Both `stars` (1–3) and `occasionId` are required — the settings UI applies
 * them together from a multi-select.
 */
export const assignUnits = mutation({
  args: {
    roomId: v.id("rooms"),
    units: v.array(bulkAssignUnitValidator),
    stars: v.union(v.literal(1), v.literal(2), v.literal(3)),
    occasionId: v.id("roomOccasions"),
  },
  returns: v.object({ assigned: v.number() }),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    if (args.units.length === 0) {
      throw new Error("Inga uppgifter valda");
    }
    if (args.units.length > MAX_BULK_ASSIGN_UNITS) {
      throw new Error(
        `Högst ${MAX_BULK_ASSIGN_UNITS} uppgifter kan tilldelas samtidigt`,
      );
    }

    const occasion = await ctx.db.get("roomOccasions", args.occasionId);
    if (occasion === null || occasion.roomId !== args.roomId) {
      throw new Error("Tillfället hittades inte");
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);

    let sortOrder = await nextSortOrderForOccasion(ctx, args.occasionId);
    const seen = new Set<string>();
    let assigned = 0;

    for (const unit of args.units) {
      const problem = await ctx.db.get("problems", unit.problemId);
      if (problem === null) {
        throw new Error("Uppgiften hittades inte");
      }
      if (isShadowProblem(problem)) {
        throw new Error("Tvillingar kan inte tilldelas");
      }
      const contentHash = problem.contentHash;
      if (contentHash === undefined) {
        throw new Error("Uppgiften saknar källa");
      }
      if (
        !problemVisibleInRoom(problem, args.roomId, files, archivedHashes)
      ) {
        throw new Error("Uppgiften tillhör inte det här rummet");
      }

      const hasParts = hasSubproblemHeadings(problem.problem);
      let letter = "";
      if (hasParts) {
        const normalized = normalizeSubproblemLetter(unit.subproblemLetter);
        if (normalized === null) {
          throw new Error("Ange deluppgift (a–z) för att tilldela");
        }
        letter = normalized;
      } else if (
        unit.subproblemLetter !== undefined &&
        unit.subproblemLetter.trim().length > 0
      ) {
        throw new Error("Uppgiften har inga deluppgifter");
      }

      const dedupeKey = `${contentHash}\0${problem.problemNumber}\0${letter}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const existingStars = await ctx.db
        .query("roomProblemStars")
        .withIndex(
          "by_room_and_contentHash_and_problemNumber_and_subproblemLetter",
          (q) =>
            q
              .eq("roomId", args.roomId)
              .eq("contentHash", contentHash)
              .eq("problemNumber", problem.problemNumber)
              .eq("subproblemLetter", letter),
        )
        .unique();
      if (existingStars !== null) {
        if (existingStars.stars !== args.stars) {
          await ctx.db.patch("roomProblemStars", existingStars._id, {
            stars: args.stars,
            subproblemLetter: letter,
          });
        }
      } else {
        await ctx.db.insert("roomProblemStars", {
          roomId: args.roomId,
          contentHash,
          problemNumber: problem.problemNumber,
          subproblemLetter: letter,
          stars: args.stars,
        });
      }

      const existingAssignment = await findAssignment(
        ctx,
        args.roomId,
        contentHash,
        problem.problemNumber,
        letter,
      );
      if (existingAssignment !== null) {
        if (existingAssignment.occasionId !== args.occasionId) {
          await ctx.db.patch("roomOccasionAssignments", existingAssignment._id, {
            occasionId: args.occasionId,
            sortOrder,
          });
          sortOrder += 1;
        }
      } else {
        await ctx.db.insert("roomOccasionAssignments", {
          roomId: args.roomId,
          occasionId: args.occasionId,
          contentHash,
          problemNumber: problem.problemNumber,
          subproblemLetter: letter,
          sortOrder,
        });
        sortOrder += 1;
      }

      assigned += 1;
    }

    return { assigned };
  },
});

/**
 * Persist manual order of units within one tillfälle (contiguous 0..n-1).
 */
export const setAssignmentOrder = mutation({
  args: {
    roomId: v.id("rooms"),
    occasionId: v.id("roomOccasions"),
    units: v.array(assignmentUnitValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    const occasion = await ctx.db.get("roomOccasions", args.occasionId);
    if (occasion === null || occasion.roomId !== args.roomId) {
      throw new Error("Tillfället hittades inte");
    }
    if (args.units.length > MAX_ASSIGNMENTS_PER_OCCASION) {
      throw new Error("För många uppgifter på ett tillfälle");
    }

    const currentOnOccasion = await ctx.db
      .query("roomOccasionAssignments")
      .withIndex("by_occasion", (q) => q.eq("occasionId", args.occasionId))
      .take(MAX_ASSIGNMENTS_PER_OCCASION);
    const byKey = new Map<string, (typeof currentOnOccasion)[number]>();
    for (const row of currentOnOccasion) {
      const letter = normalizeStoredLetter(row.subproblemLetter);
      byKey.set(
        `${row.contentHash}\0${row.problemNumber}\0${letter}`,
        row,
      );
    }

    if (args.units.length !== currentOnOccasion.length) {
      throw new Error("Ordningen måste innehålla alla uppgifter på tillfället");
    }

    const seen = new Set<string>();
    for (let index = 0; index < args.units.length; index++) {
      const unit = normalizeUnitArgs(args.units[index]!);
      const key = `${unit.contentHash}\0${unit.problemNumber}\0${unit.subproblemLetter}`;
      if (seen.has(key)) {
        throw new Error("Duplicerade uppgifter i ordningen");
      }
      seen.add(key);
      const row = byKey.get(key);
      if (row === undefined) {
        throw new Error("Uppgiften tillhör inte tillfället");
      }
      if (row.sortOrder !== index) {
        await ctx.db.patch("roomOccasionAssignments", row._id, {
          sortOrder: index,
        });
      }
    }

    return null;
  },
});

/**
 * Replace all assignments for one tillfälle with `units`.
 * Units previously on other tillfällen are moved here.
 */
export const replaceOccasionAssignments = mutation({
  args: {
    roomId: v.id("rooms"),
    occasionId: v.id("roomOccasions"),
    units: v.array(assignmentUnitValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    const occasion = await ctx.db.get("roomOccasions", args.occasionId);
    if (occasion === null || occasion.roomId !== args.roomId) {
      throw new Error("Tillfället hittades inte");
    }
    if (args.units.length > MAX_ASSIGNMENTS_PER_OCCASION) {
      throw new Error("För många uppgifter på ett tillfälle");
    }

    const desired = new Map<
      string,
      { contentHash: string; problemNumber: string; subproblemLetter: string }
    >();
    const orderedUnits: Array<{
      contentHash: string;
      problemNumber: string;
      subproblemLetter: string;
    }> = [];
    for (const raw of args.units) {
      const unit = normalizeUnitArgs(raw);
      const key = `${unit.contentHash}\0${unit.problemNumber}\0${unit.subproblemLetter}`;
      if (desired.has(key)) continue;
      desired.set(key, unit);
      orderedUnits.push(unit);
    }

    const currentOnOccasion = await ctx.db
      .query("roomOccasionAssignments")
      .withIndex("by_occasion", (q) => q.eq("occasionId", args.occasionId))
      .take(MAX_ASSIGNMENTS_PER_OCCASION);

    for (const row of currentOnOccasion) {
      const letter = normalizeStoredLetter(row.subproblemLetter);
      const key = `${row.contentHash}\0${row.problemNumber}\0${letter}`;
      if (!desired.has(key)) {
        await ctx.db.delete("roomOccasionAssignments", row._id);
      }
    }

    for (let index = 0; index < orderedUnits.length; index++) {
      const unit = orderedUnits[index]!;
      const existing = await findAssignment(
        ctx,
        args.roomId,
        unit.contentHash,
        unit.problemNumber,
        unit.subproblemLetter,
      );
      if (existing === null) {
        await ctx.db.insert("roomOccasionAssignments", {
          roomId: args.roomId,
          occasionId: args.occasionId,
          contentHash: unit.contentHash,
          problemNumber: unit.problemNumber,
          subproblemLetter: unit.subproblemLetter,
          sortOrder: index,
        });
        continue;
      }
      const patch: {
        occasionId?: Id<"roomOccasions">;
        sortOrder: number;
      } = { sortOrder: index };
      if (existing.occasionId !== args.occasionId) {
        patch.occasionId = args.occasionId;
      }
      await ctx.db.patch("roomOccasionAssignments", existing._id, patch);
    }

    return null;
  },
});
