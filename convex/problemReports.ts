import { v, type Infer } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  fileForParsedProblem,
  isShadowProblem,
  problemVisibleInRoom,
} from "./lib/problemAccess";
import {
  MAX_ADMIN_NOTE_LENGTH,
  MAX_ADMIN_REPORTS_LIST,
  MAX_REPORT_DETAILS_LENGTH,
  PROBLEM_REPORT_REASON_LABELS,
  problemReportReasonValidator,
  problemReportStatusValidator,
  type ProblemReportReason,
  type ProblemReportStatus,
} from "./lib/problemReports";
import { requireAdmin } from "./lib/roles";
import { MAX_FILES_PER_ROOM } from "./lib/roomFiles";
import { requireRoomMember } from "./lib/roomAuth";

type DbCtx = QueryCtx | MutationCtx;

async function loadArchivedContentHashes(
  ctx: DbCtx,
  roomId: Id<"rooms">,
): Promise<Set<string>> {
  const rows = await ctx.db
    .query("problemsArchivedByRoom")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_FILES_PER_ROOM);
  return new Set(rows.map((row) => row.contentHash));
}

async function assertProblemVisibleInRoom(
  ctx: DbCtx,
  roomId: Id<"rooms">,
  problem: Doc<"problems">,
): Promise<void> {
  const files = await ctx.db
    .query("files")
    .withIndex("by_room", (q) => q.eq("roomId", roomId))
    .take(MAX_FILES_PER_ROOM);
  const archived = await loadArchivedContentHashes(ctx, roomId);

  let parentContentHash: string | undefined;
  if (isShadowProblem(problem) && problem.parentProblemId !== undefined) {
    const parent = await ctx.db.get(problem.parentProblemId);
    parentContentHash = parent?.contentHash;
  }

  if (
    !problemVisibleInRoom(
      problem,
      roomId,
      files,
      archived,
      parentContentHash,
    )
  ) {
    throw new Error("Uppgiften hittades inte i rummet");
  }
}

function trimDetails(raw: string, max: number, label: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} får inte vara tom`);
  }
  if (trimmed.length > max) {
    throw new Error(`${label} är för lång (max ${max} tecken)`);
  }
  return trimmed;
}

const listItemValidator = v.object({
  _id: v.id("problemReports"),
  _creationTime: v.number(),
  reason: problemReportReasonValidator,
  reasonLabel: v.string(),
  details: v.string(),
  status: problemReportStatusValidator,
  adminNote: v.union(v.string(), v.null()),
  resolvedAt: v.union(v.number(), v.null()),
  problemId: v.id("problems"),
  problemNumber: v.string(),
  isShadow: v.boolean(),
  roomId: v.id("rooms"),
  roomName: v.string(),
  reporterUserId: v.id("users"),
  reporterName: v.union(v.string(), v.null()),
  reporterEmail: v.union(v.string(), v.null()),
});

type ListItem = Infer<typeof listItemValidator>;

const detailValidator = v.object({
  _id: v.id("problemReports"),
  _creationTime: v.number(),
  reason: problemReportReasonValidator,
  reasonLabel: v.string(),
  details: v.string(),
  status: problemReportStatusValidator,
  adminNote: v.union(v.string(), v.null()),
  resolvedAt: v.union(v.number(), v.null()),
  resolvedBy: v.union(v.id("users"), v.null()),
  problemId: v.id("problems"),
  problemNumber: v.string(),
  problemMarkdown: v.string(),
  answerMarkdown: v.string(),
  isShadow: v.boolean(),
  contentHash: v.union(v.string(), v.null()),
  sourceQuestionPageIdx: v.union(v.number(), v.null()),
  sourceAnswerPageIdx: v.union(v.number(), v.null()),
  fileName: v.union(v.string(), v.null()),
  fileId: v.union(v.id("files"), v.null()),
  roomId: v.id("rooms"),
  roomName: v.string(),
  reporterUserId: v.id("users"),
  reporterName: v.union(v.string(), v.null()),
  reporterEmail: v.union(v.string(), v.null()),
});

async function enrichListItem(
  ctx: DbCtx,
  report: Doc<"problemReports">,
): Promise<ListItem | null> {
  const [problem, room, reporter] = await Promise.all([
    ctx.db.get(report.problemId),
    ctx.db.get(report.roomId),
    ctx.db.get(report.reporterUserId),
  ]);
  if (problem === null || room === null) {
    return null;
  }

  const reason = report.reason as ProblemReportReason;
  return {
    _id: report._id,
    _creationTime: report._creationTime,
    reason,
    reasonLabel: PROBLEM_REPORT_REASON_LABELS[reason],
    details: report.details,
    status: report.status as ProblemReportStatus,
    adminNote: report.adminNote ?? null,
    resolvedAt: report.resolvedAt ?? null,
    problemId: report.problemId,
    problemNumber: problem.problemNumber,
    isShadow: isShadowProblem(problem),
    roomId: report.roomId,
    roomName: room.name,
    reporterUserId: report.reporterUserId,
    reporterName: reporter?.name ?? null,
    reporterEmail: reporter?.email ?? null,
  };
}

/** Room member reports a problem visible in that room. */
export const create = mutation({
  args: {
    roomId: v.id("rooms"),
    problemId: v.id("problems"),
    reason: problemReportReasonValidator,
    details: v.string(),
  },
  returns: v.id("problemReports"),
  handler: async (ctx, args) => {
    const userId = await requireRoomMember(ctx, args.roomId);
    const details = trimDetails(
      args.details,
      MAX_REPORT_DETAILS_LENGTH,
      "Beskrivningen",
    );

    const problem = await ctx.db.get(args.problemId);
    if (problem === null) {
      throw new Error("Uppgiften hittades inte");
    }
    await assertProblemVisibleInRoom(ctx, args.roomId, problem);

    return await ctx.db.insert("problemReports", {
      problemId: args.problemId,
      roomId: args.roomId,
      reporterUserId: userId,
      reason: args.reason,
      details,
      status: "open",
    });
  },
});

/** Admin inbox listing filtered by status (newest first). */
export const listForAdmin = query({
  args: {
    status: problemReportStatusValidator,
  },
  returns: v.array(listItemValidator),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const rows = await ctx.db
      .query("problemReports")
      .withIndex("by_status", (q) => q.eq("status", args.status))
      .order("desc")
      .take(MAX_ADMIN_REPORTS_LIST);

    const items = [];
    for (const row of rows) {
      const item = await enrichListItem(ctx, row);
      if (item !== null) {
        items.push(item);
      }
    }
    return items;
  },
});

/** Admin detail for one report including problem markdown. */
export const getForAdmin = query({
  args: {
    reportId: v.id("problemReports"),
  },
  returns: v.union(detailValidator, v.null()),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const report = await ctx.db.get(args.reportId);
    if (report === null) {
      return null;
    }

    const [problem, room, reporter] = await Promise.all([
      ctx.db.get(report.problemId),
      ctx.db.get(report.roomId),
      ctx.db.get(report.reporterUserId),
    ]);
    if (problem === null || room === null) {
      return null;
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", report.roomId))
      .take(MAX_FILES_PER_ROOM);

    let file: Doc<"files"> | undefined;
    if (isShadowProblem(problem) && problem.parentProblemId !== undefined) {
      const parent = await ctx.db.get(problem.parentProblemId);
      if (parent !== null) {
        file = fileForParsedProblem(parent, files);
      }
    } else {
      file = fileForParsedProblem(problem, files);
    }

    const reason = report.reason as ProblemReportReason;
    return {
      _id: report._id,
      _creationTime: report._creationTime,
      reason,
      reasonLabel: PROBLEM_REPORT_REASON_LABELS[reason],
      details: report.details,
      status: report.status as ProblemReportStatus,
      adminNote: report.adminNote ?? null,
      resolvedAt: report.resolvedAt ?? null,
      resolvedBy: report.resolvedBy ?? null,
      problemId: report.problemId,
      problemNumber: problem.problemNumber,
      problemMarkdown: problem.problem,
      answerMarkdown: problem.answer,
      isShadow: isShadowProblem(problem),
      contentHash: problem.contentHash ?? null,
      sourceQuestionPageIdx: problem.sourceQuestionPageIdx ?? null,
      sourceAnswerPageIdx: problem.sourceAnswerPageIdx ?? null,
      fileName: file?.name ?? null,
      fileId: file?._id ?? null,
      roomId: report.roomId,
      roomName: room.name,
      reporterUserId: report.reporterUserId,
      reporterName: reporter?.name ?? null,
      reporterEmail: reporter?.email ?? null,
    };
  },
});

export const setStatus = mutation({
  args: {
    reportId: v.id("problemReports"),
    status: problemReportStatusValidator,
    adminNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    const report = await ctx.db.get(args.reportId);
    if (report === null) {
      throw new Error("Rapporten hittades inte");
    }

    let adminNote: string | undefined = report.adminNote;
    if (args.adminNote !== undefined) {
      const trimmed = args.adminNote.trim();
      if (trimmed.length > MAX_ADMIN_NOTE_LENGTH) {
        throw new Error(
          `Anteckningen är för lång (max ${MAX_ADMIN_NOTE_LENGTH} tecken)`,
        );
      }
      adminNote = trimmed.length > 0 ? trimmed : undefined;
    }

    const patch: Partial<Doc<"problemReports">> = {
      status: args.status,
      adminNote,
    };

    if (args.status === "open") {
      patch.resolvedAt = undefined;
      patch.resolvedBy = undefined;
    } else {
      patch.resolvedAt = Date.now();
      patch.resolvedBy = adminId;
    }

    await ctx.db.patch(args.reportId, patch);
    return null;
  },
});

export const remove = mutation({
  args: {
    reportId: v.id("problemReports"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const report = await ctx.db.get(args.reportId);
    if (report === null) {
      throw new Error("Rapporten hittades inte");
    }
    await ctx.db.delete(args.reportId);
    return null;
  },
});

/**
 * Admin hotfix: patch question/answer markdown on the reported problem.
 * Marks the report resolved. Editing a global cached problem affects all rooms.
 */
export const hotfixProblem = mutation({
  args: {
    reportId: v.id("problemReports"),
    problem: v.string(),
    answer: v.string(),
    adminNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const adminId = await requireAdmin(ctx);
    const report = await ctx.db.get(args.reportId);
    if (report === null) {
      throw new Error("Rapporten hittades inte");
    }

    const problem = await ctx.db.get(report.problemId);
    if (problem === null) {
      throw new Error("Uppgiften hittades inte");
    }

    const problemMarkdown = args.problem.trim();
    const answerMarkdown = args.answer.trim();
    if (problemMarkdown.length === 0) {
      throw new Error("Uppgiftstexten får inte vara tom");
    }

    await ctx.db.patch(report.problemId, {
      problem: problemMarkdown,
      answer: answerMarkdown,
    });

    let adminNote =
      args.adminNote !== undefined
        ? args.adminNote.trim()
        : (report.adminNote ?? "Hotfix: markdown uppdaterad");
    if (adminNote.length === 0) {
      adminNote = "Hotfix: markdown uppdaterad";
    }
    if (adminNote.length > MAX_ADMIN_NOTE_LENGTH) {
      throw new Error(
        `Anteckningen är för lång (max ${MAX_ADMIN_NOTE_LENGTH} tecken)`,
      );
    }

    await ctx.db.patch(args.reportId, {
      status: "resolved",
      adminNote,
      resolvedAt: Date.now(),
      resolvedBy: adminId,
    });
    return null;
  },
});
