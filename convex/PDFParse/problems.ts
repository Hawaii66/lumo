import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  flagsForDisplay,
  lumoParsedProblemValidator,
  problemFlagValidator,
  problemImageStorageValidator,
  problemImageUrlValidator,
  type LumoParsedProblem,
  type ProblemFlag,
} from "../lib/lumoContent";
import {
  fileForParsedProblem,
  isShadowProblem,
  problemVisibleInRoom,
} from "../lib/problemAccess";
import { MAX_FILES_PER_ROOM } from "../lib/roomFiles";
import { requireRoomMember } from "../lib/roomAuth";
import {
  hasSubproblemHeadings,
  normalizeSubproblemLetter,
} from "../lib/subproblemSlice";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Upper bound of problems expected from a single PDF. */
const MAX_PROBLEMS_PER_PDF = 500;
/** Upper bound of shadow twins per parent per room. */
export const MAX_SHADOWS_PER_PARENT = 20;
/** Hard cap for the room-wide shadow batch in listGroupedByRoom. */
const MAX_SHADOWS_PER_ROOM = MAX_PROBLEMS_PER_PDF * MAX_SHADOWS_PER_PARENT;
/** Max deluppgifter (a–z) we expect to star / complete per problem. */
const MAX_STAR_LETTERS_PER_PROBLEM = 26;
/** Hard cap for roomProblemStars batch in listGroupedByRoom. */
const MAX_STARS_PER_ROOM =
  MAX_PROBLEMS_PER_PDF * MAX_FILES_PER_ROOM * MAX_STAR_LETTERS_PER_PROBLEM;
/** Hard cap for roomProblemCompletions batch in listGroupedByRoom. */
const MAX_COMPLETIONS_PER_ROOM = MAX_STARS_PER_ROOM;

const starsLevelValidator = v.union(
  v.literal(0),
  v.literal(1),
  v.literal(2),
  v.literal(3),
);

const starEntryValidator = v.object({
  /** `""` = whole problem; otherwise `a`–`z`. */
  letter: v.string(),
  stars: v.union(v.literal(1), v.literal(2), v.literal(3)),
});

/** Letters marked complete; `""` = whole problem. */
const completionEntryValidator = v.object({
  letter: v.string(),
});

function normalizeStoredStarLetter(letter: string | undefined): string {
  if (letter === undefined || letter === "") return "";
  return normalizeSubproblemLetter(letter) ?? "";
}

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

/** Resolve parent contentHash for shadow archive checks. */
async function parentContentHashForShadow(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"problems">,
): Promise<string | undefined> {
  if (!isShadowProblem(row) || row.parentProblemId === undefined) {
    return undefined;
  }
  const parent = await ctx.db.get(row.parentProblemId);
  return parent?.contentHash;
}

async function isVisibleInRoom(
  ctx: QueryCtx | MutationCtx,
  row: Doc<"problems">,
  roomId: Id<"rooms">,
  roomFiles: Array<Doc<"files">>,
  archivedContentHashes: ReadonlySet<string>,
): Promise<boolean> {
  const parentHash = await parentContentHashForShadow(ctx, row);
  return problemVisibleInRoom(
    row,
    roomId,
    roomFiles,
    archivedContentHashes,
    parentHash,
  );
}

function compareProblemNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function compareFileNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Ordered PDFs first (ascending), then unordered by file name. */
function compareProblemGroups(
  a: { fileName: string; problemSortOrder?: number },
  b: { fileName: string; problemSortOrder?: number },
): number {
  const aOrder = a.problemSortOrder;
  const bOrder = b.problemSortOrder;
  if (aOrder !== undefined && bOrder !== undefined) {
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return compareFileNames(a.fileName, b.fileName);
  }
  if (aOrder !== undefined) return -1;
  if (bOrder !== undefined) return 1;
  return compareFileNames(a.fileName, b.fileName);
}

const problemRowValidator = v.object({
  problemNumber: v.string(),
  problem: v.string(),
  answer: v.string(),
  flags: v.optional(v.array(problemFlagValidator)),
  sourceQuestionPageIdx: v.optional(v.number()),
  sourceAnswerPageIdx: v.optional(v.number()),
  questionImages: v.optional(v.array(problemImageStorageValidator)),
  answerImages: v.optional(v.array(problemImageStorageValidator)),
});

const problemWithUrlsValidator = lumoParsedProblemValidator.extend({
  questionImages: v.optional(v.array(problemImageUrlValidator)),
  answerImages: v.optional(v.array(problemImageUrlValidator)),
});

const shadowListItemValidator = v.object({
  id: v.id("problems"),
  problemNumber: v.string(),
});

const problemGroupItemValidator = v.object({
  fileId: v.id("files"),
  fileName: v.string(),
  problems: v.array(
    v.object({
      id: v.id("problems"),
      problemNumber: v.string(),
      starEntries: v.array(starEntryValidator),
      completionEntries: v.array(completionEntryValidator),
      shadows: v.array(shadowListItemValidator),
    }),
  ),
});

const archivedProblemPdfValidator = v.object({
  fileId: v.id("files"),
  fileName: v.string(),
});

/**
 * All parsed problems in a room, grouped by source file.
 * Room-scoped shadows are nested under their parent.
 * Files with no cached problems are omitted.
 * Archived PDFs are listed separately (name only, no problem payloads).
 */
export const listGroupedByRoom = query({
  args: { roomId: v.id("rooms") },
  returns: v.object({
    groups: v.array(problemGroupItemValidator),
    archived: v.array(archivedProblemPdfValidator),
  }),
  handler: async (ctx, args) => {
    if (!(await isRoomMember(ctx, args.roomId))) {
      return { groups: [], archived: [] };
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .order("desc")
      .take(MAX_FILES_PER_ROOM);

    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);

    // One indexed read per unique PDF hash (not per file).
    const problemsByHash = new Map<string, Array<Doc<"problems">>>();
    for (const hash of new Set(files.map((file) => file.contentHash))) {
      const rows = await ctx.db
        .query("problems")
        .withIndex("by_contentHash", (q) => q.eq("contentHash", hash))
        .take(MAX_PROBLEMS_PER_PDF);
      problemsByHash.set(
        hash,
        rows.filter((row) => !isShadowProblem(row)),
      );
    }

    const parentIds = new Set<Id<"problems">>();
    for (const rows of problemsByHash.values()) {
      for (const row of rows) {
        parentIds.add(row._id);
      }
    }

    // One indexed read for all room shadows (index prefix on roomId).
    const shadowsByParent = new Map<
      Id<"problems">,
      Array<{ id: Id<"problems">; problemNumber: string }>
    >();
    if (parentIds.size > 0) {
      const shadowCap = Math.min(
        parentIds.size * MAX_SHADOWS_PER_PARENT,
        MAX_SHADOWS_PER_ROOM,
      );
      const shadowRows = await ctx.db
        .query("problems")
        .withIndex("by_room_and_parent", (q) => q.eq("roomId", args.roomId))
        .take(shadowCap);
      for (const shadow of shadowRows) {
        if (shadow.parentProblemId === undefined) continue;
        if (!parentIds.has(shadow.parentProblemId)) continue;
        const list = shadowsByParent.get(shadow.parentProblemId) ?? [];
        list.push({ id: shadow._id, problemNumber: shadow.problemNumber });
        shadowsByParent.set(shadow.parentProblemId, list);
      }
      for (const list of shadowsByParent.values()) {
        list.sort((a, b) =>
          compareProblemNumbers(a.problemNumber, b.problemNumber),
        );
      }
    }

    // One indexed read for all room stars → group by problem identity.
    const starsByProblem = new Map<
      string,
      Array<{ letter: string; stars: 1 | 2 | 3 }>
    >();
    const starRows = await ctx.db
      .query("roomProblemStars")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_STARS_PER_ROOM);
    for (const row of starRows) {
      const letter = normalizeStoredStarLetter(row.subproblemLetter);
      const key = `${row.contentHash}\0${row.problemNumber}`;
      const list = starsByProblem.get(key) ?? [];
      list.push({ letter, stars: row.stars });
      starsByProblem.set(key, list);
    }
    for (const list of starsByProblem.values()) {
      list.sort((a, b) => a.letter.localeCompare(b.letter));
    }

    // One indexed read for all room completions → group by problem identity.
    const completionsByProblem = new Map<
      string,
      Array<{ letter: string }>
    >();
    const completionRows = await ctx.db
      .query("roomProblemCompletions")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_COMPLETIONS_PER_ROOM);
    for (const row of completionRows) {
      const letter = normalizeStoredStarLetter(row.subproblemLetter);
      const key = `${row.contentHash}\0${row.problemNumber}`;
      const list = completionsByProblem.get(key) ?? [];
      list.push({ letter });
      completionsByProblem.set(key, list);
    }
    for (const list of completionsByProblem.values()) {
      list.sort((a, b) => a.letter.localeCompare(b.letter));
    }

    const groups: Array<{
      fileId: Id<"files">;
      fileName: string;
      problemSortOrder?: number;
      problems: Array<{
        id: Id<"problems">;
        problemNumber: string;
        starEntries: Array<{ letter: string; stars: 1 | 2 | 3 }>;
        completionEntries: Array<{ letter: string }>;
        shadows: Array<{ id: Id<"problems">; problemNumber: string }>;
      }>;
    }> = [];
    const archived: Array<{ fileId: Id<"files">; fileName: string }> = [];

    for (const file of files) {
      const parsed = problemsByHash.get(file.contentHash) ?? [];
      if (parsed.length === 0) {
        continue;
      }

      if (archivedHashes.has(file.contentHash)) {
        archived.push({ fileId: file._id, fileName: file.name });
        continue;
      }

      groups.push({
        fileId: file._id,
        fileName: file.name,
        ...(file.problemSortOrder !== undefined
          ? { problemSortOrder: file.problemSortOrder }
          : {}),
        problems: [...parsed]
          .sort((a, b) =>
            compareProblemNumbers(a.problemNumber, b.problemNumber),
          )
          .map((row) => {
            const key = `${file.contentHash}\0${row.problemNumber}`;
            return {
              id: row._id,
              problemNumber: row.problemNumber,
              starEntries: starsByProblem.get(key) ?? [],
              completionEntries: completionsByProblem.get(key) ?? [],
              shadows: shadowsByParent.get(row._id) ?? [],
            };
          }),
      });
    }

    groups.sort(compareProblemGroups);
    archived.sort((a, b) => compareFileNames(a.fileName, b.fileName));
    return {
      groups: groups.map(({ problemSortOrder: _order, ...group }) => group),
      archived,
    };
  },
});

/**
 * Archive a PDF's parsed problems in this room only (global cache unchanged).
 */
export const archiveProblemsFromRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    fileId: v.id("files"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const file = await ctx.db.get("files", args.fileId);
    if (file === null || file.roomId !== args.roomId) {
      throw new Error("Filen hittades inte");
    }

    const existing = await ctx.db
      .query("problemsArchivedByRoom")
      .withIndex("by_room_and_contentHash", (q) =>
        q.eq("roomId", args.roomId).eq("contentHash", file.contentHash),
      )
      .first();
    if (existing === null) {
      await ctx.db.insert("problemsArchivedByRoom", {
        roomId: args.roomId,
        contentHash: file.contentHash,
      });
    }
    return null;
  },
});

/**
 * Restore an archived PDF's problems into this room's main list.
 */
export const unarchiveProblemsFromRoom = mutation({
  args: {
    roomId: v.id("rooms"),
    fileId: v.id("files"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const file = await ctx.db.get("files", args.fileId);
    if (file === null || file.roomId !== args.roomId) {
      throw new Error("Filen hittades inte");
    }

    const existing = await ctx.db
      .query("problemsArchivedByRoom")
      .withIndex("by_room_and_contentHash", (q) =>
        q.eq("roomId", args.roomId).eq("contentHash", file.contentHash),
      )
      .first();
    if (existing !== null) {
      await ctx.db.delete("problemsArchivedByRoom", existing._id);
    }
    return null;
  },
});

/**
 * Set or clear the room-scoped star rating for a parsed problem / deluppgift.
 * stars=0 deletes the row. `subproblemLetter` is required when the problem
 * has deluppgifter; omit / empty when it does not.
 */
export const setStars = mutation({
  args: {
    roomId: v.id("rooms"),
    problemId: v.id("problems"),
    stars: starsLevelValidator,
    subproblemLetter: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const problem = await ctx.db.get(args.problemId);
    if (problem === null) {
      throw new Error("Uppgiften hittades inte");
    }
    if (isShadowProblem(problem)) {
      throw new Error("Tvillingar kan inte stjärnmärkas");
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
      !(await isVisibleInRoom(
        ctx,
        problem,
        args.roomId,
        files,
        archivedHashes,
      ))
    ) {
      throw new Error("Uppgiften tillhör inte det här rummet");
    }

    const hasParts = hasSubproblemHeadings(problem.problem);
    let letter = "";
    if (hasParts) {
      const normalized = normalizeSubproblemLetter(args.subproblemLetter);
      if (normalized === null) {
        throw new Error("Ange deluppgift (a–z) för att stjärnmärka");
      }
      letter = normalized;
    } else if (
      args.subproblemLetter !== undefined &&
      args.subproblemLetter.trim().length > 0
    ) {
      throw new Error("Uppgiften har inga deluppgifter");
    }

    const existing = await ctx.db
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

    if (args.stars === 0) {
      if (existing !== null) {
        await ctx.db.delete("roomProblemStars", existing._id);
      }
      return null;
    }

    if (existing !== null) {
      await ctx.db.patch("roomProblemStars", existing._id, {
        stars: args.stars,
        subproblemLetter: letter,
      });
    } else {
      await ctx.db.insert("roomProblemStars", {
        roomId: args.roomId,
        contentHash,
        problemNumber: problem.problemNumber,
        subproblemLetter: letter,
        stars: args.stars,
      });
    }
    return null;
  },
});

/**
 * Mark or clear room-scoped completion for a parsed problem / deluppgift.
 * completed=false deletes the row. Same letter rules as setStars.
 * Not copied into templates.
 */
export const setCompleted = mutation({
  args: {
    roomId: v.id("rooms"),
    problemId: v.id("problems"),
    completed: v.boolean(),
    subproblemLetter: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);

    const problem = await ctx.db.get(args.problemId);
    if (problem === null) {
      throw new Error("Uppgiften hittades inte");
    }
    if (isShadowProblem(problem)) {
      throw new Error("Tvillingar kan inte markeras som klara");
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
      !(await isVisibleInRoom(
        ctx,
        problem,
        args.roomId,
        files,
        archivedHashes,
      ))
    ) {
      throw new Error("Uppgiften tillhör inte det här rummet");
    }

    const hasParts = hasSubproblemHeadings(problem.problem);
    let letter = "";
    if (hasParts) {
      const normalized = normalizeSubproblemLetter(args.subproblemLetter);
      if (normalized === null) {
        throw new Error("Ange deluppgift (a–z) för att markera som klar");
      }
      letter = normalized;
    } else if (
      args.subproblemLetter !== undefined &&
      args.subproblemLetter.trim().length > 0
    ) {
      throw new Error("Uppgiften har inga deluppgifter");
    }

    const existing = await ctx.db
      .query("roomProblemCompletions")
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

    if (!args.completed) {
      if (existing !== null) {
        await ctx.db.delete("roomProblemCompletions", existing._id);
      }
      return null;
    }

    if (existing === null) {
      await ctx.db.insert("roomProblemCompletions", {
        roomId: args.roomId,
        contentHash,
        problemNumber: problem.problemNumber,
        subproblemLetter: letter,
      });
    }
    return null;
  },
});

const roomProblemResultValidator = v.object({
  id: v.id("problems"),
  fileId: v.union(v.id("files"), v.null()),
  fileName: v.string(),
  fileUrl: v.union(v.string(), v.null()),
  isShadow: v.boolean(),
  parentProblemId: v.union(v.id("problems"), v.null()),
  parentProblemNumber: v.union(v.string(), v.null()),
  sourceQuestionPageIdx: v.union(v.number(), v.null()),
  sourceAnswerPageIdx: v.union(v.number(), v.null()),
  problem: problemWithUrlsValidator,
});

async function resolveImageUrls(
  ctx: QueryCtx,
  images: Array<{ storageId: Id<"_storage"> }> | undefined,
): Promise<Array<{ url: string }>> {
  if (images === undefined || images.length === 0) {
    return [];
  }
  const urls: Array<{ url: string }> = [];
  for (const image of images) {
    const url = await ctx.storage.getUrl(image.storageId);
    if (url !== null) {
      urls.push({ url });
    }
  }
  return urls;
}

async function resolveRoomProblem(
  ctx: QueryCtx,
  roomId: Id<"rooms">,
  row: Doc<"problems">,
  roomFiles: Array<Doc<"files">>,
  archivedContentHashes: ReadonlySet<string>,
): Promise<{
  id: Id<"problems">;
  fileId: Id<"files"> | null;
  fileName: string;
  fileUrl: string | null;
  isShadow: boolean;
  parentProblemId: Id<"problems"> | null;
  parentProblemNumber: string | null;
  sourceQuestionPageIdx: number | null;
  sourceAnswerPageIdx: number | null;
  problem: LumoParsedProblem & {
    questionImages?: Array<{ url: string }>;
    answerImages?: Array<{ url: string }>;
  };
} | null> {
  if (
    !(await isVisibleInRoom(
      ctx,
      row,
      roomId,
      roomFiles,
      archivedContentHashes,
    ))
  ) {
    return null;
  }

  const shadow = isShadowProblem(row);
  let fileId: Id<"files"> | null = null;
  let fileName = "Tvilling";
  let fileUrl: string | null = null;
  let parentProblemNumber: string | null = null;

  if (shadow && row.parentProblemId !== undefined) {
    const parent = await ctx.db.get(row.parentProblemId);
    if (parent !== null) {
      parentProblemNumber = parent.problemNumber;
      const parentFile = fileForParsedProblem(parent, roomFiles);
      if (parentFile !== undefined) {
        fileId = parentFile._id;
        fileName = parentFile.name;
        fileUrl = await ctx.storage.getUrl(parentFile.storageId);
      }
    }
  } else {
    const file = fileForParsedProblem(row, roomFiles);
    if (file === undefined) {
      return null;
    }
    fileId = file._id;
    fileName = file.name;
    fileUrl = await ctx.storage.getUrl(file.storageId);
  }

  const questionImages = await resolveImageUrls(ctx, row.questionImages);
  const answerImages = await resolveImageUrls(ctx, row.answerImages);
  const flags = flagsForDisplay(
    (row.flags ?? []) as Array<ProblemFlag>,
    questionImages.length,
  );

  return {
    id: row._id,
    fileId,
    fileName,
    fileUrl,
    isShadow: shadow,
    parentProblemId: row.parentProblemId ?? null,
    parentProblemNumber,
    sourceQuestionPageIdx: shadow
      ? null
      : (row.sourceQuestionPageIdx ?? null),
    sourceAnswerPageIdx: shadow ? null : (row.sourceAnswerPageIdx ?? null),
    problem: {
      problemNumber: row.problemNumber,
      question: row.problem,
      answer: row.answer,
      flags,
      ...(questionImages.length > 0 ? { questionImages } : {}),
      ...(answerImages.length > 0 ? { answerImages } : {}),
    },
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
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);

    return await resolveRoomProblem(
      ctx,
      args.roomId,
      row,
      files,
      archivedHashes,
    );
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
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);

    const results = [];
    for (const problemId of ids) {
      const row = await ctx.db.get(problemId);
      if (row === null) continue;
      const resolved = await resolveRoomProblem(
        ctx,
        args.roomId,
        row,
        files,
        archivedHashes,
      );
      if (resolved !== null) {
        results.push(resolved);
      }
    }
    return results;
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
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);

    const results = [];
    for (const problemId of ids) {
      const row = await ctx.db.get(problemId);
      if (row === null) continue;
      if (
        !(await isVisibleInRoom(
          ctx,
          row,
          args.roomId,
          files,
          archivedHashes,
        ))
      ) {
        continue;
      }
      results.push({
        problemNumber: row.problemNumber,
        questionText: row.problem,
        answerText: row.answer,
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
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);

    if (
      !(await isVisibleInRoom(
        ctx,
        parent,
        args.roomId,
        files,
        archivedHashes,
      ))
    ) {
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
      questionText: parent.problem,
      answerText: parent.answer,
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
    problem: v.string(),
    answer: v.string(),
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
    const archivedHashes = await loadArchivedContentHashes(ctx, args.roomId);
    if (
      !(await isVisibleInRoom(
        ctx,
        parent,
        args.roomId,
        files,
        archivedHashes,
      ))
    ) {
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

/**
 * Clean-slate wipe of all problems (parsed + shadows).
 * Run once after deploying the markdown schema change.
 */
export const wipeAllProblems = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    let deleted = 0;
    for (;;) {
      const batch = await ctx.db.query("problems").take(200);
      if (batch.length === 0) break;
      for (const row of batch) {
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    return deleted;
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
        ...(problem.flags !== undefined && problem.flags.length > 0
          ? { flags: problem.flags }
          : {}),
        ...(problem.sourceQuestionPageIdx !== undefined
          ? { sourceQuestionPageIdx: problem.sourceQuestionPageIdx }
          : {}),
        ...(problem.sourceAnswerPageIdx !== undefined
          ? { sourceAnswerPageIdx: problem.sourceAnswerPageIdx }
          : {}),
        ...(problem.questionImages !== undefined &&
        problem.questionImages.length > 0
          ? { questionImages: problem.questionImages }
          : {}),
        ...(problem.answerImages !== undefined &&
        problem.answerImages.length > 0
          ? { answerImages: problem.answerImages }
          : {}),
      });
    }

    return null;
  },
});
