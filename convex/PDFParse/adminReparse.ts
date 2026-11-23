import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import {
  flagsForDisplay,
  problemFlagValidator,
  problemImageStorageValidator,
  type ProblemFlag,
} from "../lib/lumoContent";
import { isShadowProblem } from "../lib/problemAccess";
import { requireAdmin } from "../lib/roles";
import { listSubproblemLetters } from "../lib/subproblemSlice";

const MAX_PROBLEMS_PER_PDF = 500;
const MAX_SHADOWS_PER_PARENT = 20;
const MAX_PROGRESS_ROWS = 5000;
const MAX_ADMIN_RUNS_LOOKUP = 40;
const MAX_JOBS_LOOKUP = 40;

const presenceValidator = v.union(
  v.literal("both"),
  v.literal("liveOnly"),
  v.literal("previewOnly"),
);

const decisionActionValidator = v.union(
  v.literal("keep"),
  v.literal("replace"),
  v.literal("delete"),
  v.literal("add"),
  v.literal("skip"),
);

const sideSummaryValidator = v.object({
  question: v.string(),
  answer: v.string(),
  flags: v.array(problemFlagValidator),
  letters: v.array(v.string()),
  letterLabel: v.string(),
  sourceQuestionPageIdx: v.union(v.number(), v.null()),
  sourceAnswerPageIdx: v.union(v.number(), v.null()),
  questionImageCount: v.number(),
  answerImageCount: v.number(),
});

const diffRowValidator = v.object({
  problemNumber: v.string(),
  presence: presenceValidator,
  contentChanged: v.boolean(),
  lettersChanged: v.boolean(),
  defaultAction: decisionActionValidator,
  allowedActions: v.array(decisionActionValidator),
  live: v.union(sideSummaryValidator, v.null()),
  preview: v.union(sideSummaryValidator, v.null()),
  shadowCount: v.number(),
});

const impactValidator = v.object({
  orphanStars: v.number(),
  orphanCompletions: v.number(),
  orphanAssignments: v.number(),
  shadowsDropped: v.number(),
  deleteCount: v.number(),
  replaceCount: v.number(),
  keepCount: v.number(),
  addCount: v.number(),
  skipCount: v.number(),
});

type DecisionAction = "keep" | "replace" | "delete" | "add" | "skip";
type Presence = "both" | "liveOnly" | "previewOnly";

type StoredImage = {
  storageId: Id<"_storage">;
  subproblemLetter?: string;
};

type ProblemBody = {
  problemNumber: string;
  problem: string;
  answer: string;
  flags: Array<ProblemFlag>;
  sourceQuestionPageIdx?: number;
  sourceAnswerPageIdx?: number;
  questionImages?: Array<StoredImage>;
  answerImages?: Array<StoredImage>;
};

type PreviewImage = {
  storageId: string;
  url?: string;
  subproblemLetter?: string;
};

type PreviewProblem = {
  problemNumber: string;
  question: string;
  answer: string;
  flags?: Array<ProblemFlag>;
  sourceQuestionPageIdx?: number;
  sourceAnswerPageIdx?: number;
  questionImages?: Array<PreviewImage>;
  answerImages?: Array<PreviewImage>;
};

type PreviewPayload =
  | { kind: "problems"; problems: Array<PreviewProblem> }
  | { kind: "info"; text: string };

type LiveSnapshotProblem = ProblemBody & { shadowCount: number };
type LiveSnapshot = { problems: Array<LiveSnapshotProblem> };

type AdminRunInternal = {
  _id: Id<"pdfAdminRuns">;
  name: string;
  storageId: Id<"_storage">;
  contentHash: string;
  createdBy: Id<"users">;
  kind: "problems" | "info";
  commitToDb: boolean;
  status: "pending" | "running" | "done" | "failed";
  stage: "queued" | "mineru" | "ai" | "commit" | "done";
  fromStage: "mineru" | "ai" | "commit";
  invalidateMineru: boolean;
  previewStorageId: Id<"_storage"> | null;
} | null;

type PublishAllowed =
  | { ok: true }
  | { ok: false; reason: string };

function snapshotToBody(p: LiveSnapshotProblem): ProblemBody {
  return {
    problemNumber: p.problemNumber,
    problem: p.problem,
    answer: p.answer,
    flags: p.flags,
    ...(p.sourceQuestionPageIdx !== undefined
      ? { sourceQuestionPageIdx: p.sourceQuestionPageIdx }
      : {}),
    ...(p.sourceAnswerPageIdx !== undefined
      ? { sourceAnswerPageIdx: p.sourceAnswerPageIdx }
      : {}),
    ...(p.questionImages !== undefined
      ? { questionImages: p.questionImages }
      : {}),
    ...(p.answerImages !== undefined ? { answerImages: p.answerImages } : {}),
  };
}

function compareProblemNumbers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function letterLabel(letters: Array<string>): string {
  if (letters.length === 0) return "hel uppgift";
  return letters.join(", ");
}

function progressLetterSet(question: string): Set<string> {
  const letters = listSubproblemLetters(question);
  if (letters.length === 0) return new Set([""]);
  return new Set(letters);
}

function normalizeStoredLetter(letter: string | undefined): string {
  if (letter === undefined || letter.trim() === "") return "";
  return letter.trim().toLowerCase();
}

function imageKey(image: StoredImage): string {
  const letter = normalizeStoredLetter(image.subproblemLetter);
  return `${image.storageId}\0${letter}`;
}

function sortedImageKeys(images: Array<StoredImage> | undefined): Array<string> {
  return (images ?? []).map(imageKey).sort();
}

function sameStringArray(a: Array<string>, b: Array<string>): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function sameFlags(
  a: Array<ProblemFlag>,
  b: Array<ProblemFlag>,
): boolean {
  if (a.length !== b.length) return false;
  const ak = a.map((f) => f.kind).sort();
  const bk = b.map((f) => f.kind).sort();
  return sameStringArray(ak, bk);
}

function contentEqual(live: ProblemBody, preview: ProblemBody): boolean {
  if (live.problem !== preview.problem) return false;
  if (live.answer !== preview.answer) return false;
  if (!sameFlags(live.flags, preview.flags)) return false;
  if (
    (live.sourceQuestionPageIdx ?? null) !==
    (preview.sourceQuestionPageIdx ?? null)
  ) {
    return false;
  }
  if (
    (live.sourceAnswerPageIdx ?? null) !==
    (preview.sourceAnswerPageIdx ?? null)
  ) {
    return false;
  }
  if (
    !sameStringArray(
      sortedImageKeys(live.questionImages),
      sortedImageKeys(preview.questionImages),
    )
  ) {
    return false;
  }
  if (
    !sameStringArray(
      sortedImageKeys(live.answerImages),
      sortedImageKeys(preview.answerImages),
    )
  ) {
    return false;
  }
  return true;
}

function toSideSummary(body: ProblemBody) {
  const letters = listSubproblemLetters(body.problem);
  return {
    question: body.problem,
    answer: body.answer,
    flags: body.flags,
    letters,
    letterLabel: letterLabel(letters),
    sourceQuestionPageIdx: body.sourceQuestionPageIdx ?? null,
    sourceAnswerPageIdx: body.sourceAnswerPageIdx ?? null,
    questionImageCount: body.questionImages?.length ?? 0,
    answerImageCount: body.answerImages?.length ?? 0,
  };
}

function previewToBody(p: PreviewProblem): ProblemBody {
  const questionImages = (p.questionImages ?? [])
    .map((img) => {
      const letter = normalizeStoredLetter(img.subproblemLetter);
      return {
        storageId: img.storageId as Id<"_storage">,
        ...(letter.length > 0 ? { subproblemLetter: letter } : {}),
      };
    })
    .filter((img) => typeof img.storageId === "string" && img.storageId.length > 0);

  const answerImages = (p.answerImages ?? [])
    .map((img) => {
      const letter = normalizeStoredLetter(img.subproblemLetter);
      return {
        storageId: img.storageId as Id<"_storage">,
        ...(letter.length > 0 ? { subproblemLetter: letter } : {}),
      };
    })
    .filter((img) => typeof img.storageId === "string" && img.storageId.length > 0);

  const flags = flagsForDisplay(p.flags ?? [], questionImages.length);

  return {
    problemNumber: p.problemNumber,
    problem: p.question,
    answer: p.answer,
    flags,
    ...(p.sourceQuestionPageIdx !== undefined
      ? { sourceQuestionPageIdx: p.sourceQuestionPageIdx }
      : {}),
    ...(p.sourceAnswerPageIdx !== undefined
      ? { sourceAnswerPageIdx: p.sourceAnswerPageIdx }
      : {}),
    ...(questionImages.length > 0 ? { questionImages } : {}),
    ...(answerImages.length > 0 ? { answerImages } : {}),
  };
}

function liveRowToBody(row: Doc<"problems">): ProblemBody {
  return {
    problemNumber: row.problemNumber,
    problem: row.problem,
    answer: row.answer,
    flags: flagsForDisplay(row.flags ?? [], row.questionImages?.length ?? 0),
    ...(row.sourceQuestionPageIdx !== undefined
      ? { sourceQuestionPageIdx: row.sourceQuestionPageIdx }
      : {}),
    ...(row.sourceAnswerPageIdx !== undefined
      ? { sourceAnswerPageIdx: row.sourceAnswerPageIdx }
      : {}),
    ...(row.questionImages !== undefined && row.questionImages.length > 0
      ? { questionImages: row.questionImages }
      : {}),
    ...(row.answerImages !== undefined && row.answerImages.length > 0
      ? { answerImages: row.answerImages }
      : {}),
  };
}

function defaultAndAllowed(
  presence: Presence,
  contentChanged: boolean,
): { defaultAction: DecisionAction; allowedActions: Array<DecisionAction> } {
  if (presence === "previewOnly") {
    return { defaultAction: "add", allowedActions: ["add", "skip"] };
  }
  if (presence === "liveOnly") {
    return { defaultAction: "keep", allowedActions: ["keep", "delete"] };
  }
  return {
    defaultAction: contentChanged ? "replace" : "keep",
    allowedActions: ["keep", "replace", "delete"],
  };
}

function bodyToReplaceRow(body: ProblemBody) {
  return {
    problemNumber: body.problemNumber,
    problem: body.problem,
    answer: body.answer,
    ...(body.flags.length > 0 ? { flags: body.flags } : {}),
    ...(body.sourceQuestionPageIdx !== undefined
      ? { sourceQuestionPageIdx: body.sourceQuestionPageIdx }
      : {}),
    ...(body.sourceAnswerPageIdx !== undefined
      ? { sourceAnswerPageIdx: body.sourceAnswerPageIdx }
      : {}),
    ...(body.questionImages !== undefined && body.questionImages.length > 0
      ? { questionImages: body.questionImages }
      : {}),
    ...(body.answerImages !== undefined && body.answerImages.length > 0
      ? { answerImages: body.answerImages }
      : {}),
  };
}

async function softRequireAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  try {
    return await requireAdmin(ctx);
  } catch {
    return null;
  }
}

async function loadLiveBodies(
  ctx: QueryCtx | MutationCtx,
  contentHash: string,
): Promise<{
  bodies: Map<string, ProblemBody>;
  shadowCounts: Map<string, number>;
}> {
  const rows = await ctx.db
    .query("problems")
    .withIndex("by_contentHash", (q) => q.eq("contentHash", contentHash))
    .take(MAX_PROBLEMS_PER_PDF);

  const bodies = new Map<string, ProblemBody>();
  const shadowCounts = new Map<string, number>();

  for (const row of rows) {
    if (isShadowProblem(row)) continue;
    bodies.set(row.problemNumber, liveRowToBody(row));

    const shadows = await ctx.db
      .query("problems")
      .withIndex("by_parent", (q) => q.eq("parentProblemId", row._id))
      .take(MAX_SHADOWS_PER_PARENT * 50);
    shadowCounts.set(row.problemNumber, shadows.length);
  }

  return { bodies, shadowCounts };
}

function parsePreviewPayload(raw: unknown): PreviewPayload {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("kind" in raw) ||
    ((raw as { kind: unknown }).kind !== "problems" &&
      (raw as { kind: unknown }).kind !== "info")
  ) {
    throw new Error("Förhandsgranskningen har fel format");
  }
  return raw as PreviewPayload;
}

type ProgressRow = {
  problemNumber: string;
  subproblemLetter?: string;
};

function countOrphansForDecisions(
  rows: Array<ProgressRow>,
  liveBodies: Map<string, ProblemBody>,
  previewBodies: Map<string, ProblemBody>,
  decisions: Map<string, DecisionAction>,
): number {
  let count = 0;
  for (const row of rows) {
    const action = decisions.get(row.problemNumber);
    if (action === undefined) continue;
    const letter = normalizeStoredLetter(row.subproblemLetter);

    if (action === "delete") {
      count += 1;
      continue;
    }

    if (action === "replace") {
      const preview = previewBodies.get(row.problemNumber);
      if (preview === undefined) {
        count += 1;
        continue;
      }
      const newLetters = progressLetterSet(preview.problem);
      if (!newLetters.has(letter)) {
        count += 1;
      }
      continue;
    }

    if (action === "keep") {
      const live = liveBodies.get(row.problemNumber);
      if (live === undefined) {
        count += 1;
        continue;
      }
      const keepLetters = progressLetterSet(live.problem);
      if (!keepLetters.has(letter)) {
        count += 1;
      }
    }
  }
  return count;
}

export const getDiff = action({
  args: { runId: v.id("pdfAdminRuns") },
  returns: v.object({
    contentHash: v.string(),
    runName: v.string(),
    rows: v.array(diffRowValidator),
    summary: v.object({
      bothUnchanged: v.number(),
      bothChanged: v.number(),
      liveOnly: v.number(),
      previewOnly: v.number(),
    }),
  }),
  handler: async (ctx, args): Promise<{
    contentHash: string;
    runName: string;
    rows: Array<{
      problemNumber: string;
      presence: Presence;
      contentChanged: boolean;
      lettersChanged: boolean;
      defaultAction: DecisionAction;
      allowedActions: Array<DecisionAction>;
      live: ReturnType<typeof toSideSummary> | null;
      preview: ReturnType<typeof toSideSummary> | null;
      shadowCount: number;
    }>;
    summary: {
      bothUnchanged: number;
      bothChanged: number;
      liveOnly: number;
      previewOnly: number;
    };
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }
    const adminId: Id<"users"> | null = await ctx.runQuery(
      internal.PDFParse.adminParse.getAdminUserIdInternal,
      {},
    );
    if (adminId === null) {
      throw new Error("Endast admin");
    }

    const run: AdminRunInternal = await ctx.runQuery(
      internal.PDFParse.adminParse.getInternal,
      { runId: args.runId },
    );
    if (run === null) {
      throw new Error("Körningen hittades inte");
    }
    if (run.kind !== "problems") {
      throw new Error("Diff finns bara för uppgiftsparse");
    }
    if (run.previewStorageId === null) {
      throw new Error("Ingen förhandsgranskning — kör AI först");
    }

    const blob = await ctx.storage.get(run.previewStorageId);
    if (blob === null) {
      throw new Error("Förhandsgranskningen hittades inte");
    }
    const payload = parsePreviewPayload(JSON.parse(await blob.text()));
    if (payload.kind !== "problems") {
      throw new Error("Förhandsgranskningen är inte uppgifter");
    }

    const live: LiveSnapshot = await ctx.runQuery(
      internal.PDFParse.adminReparse.getLiveSnapshotInternal,
      { contentHash: run.contentHash },
    );

    const previewBodies = new Map<string, ProblemBody>();
    for (const p of payload.problems) {
      previewBodies.set(p.problemNumber, previewToBody(p));
    }

    const liveBodies = new Map<string, ProblemBody>();
    const shadowCounts = new Map<string, number>();
    for (const p of live.problems) {
      liveBodies.set(p.problemNumber, snapshotToBody(p));
      shadowCounts.set(p.problemNumber, p.shadowCount);
    }

    const numbers = new Set<string>([
      ...liveBodies.keys(),
      ...previewBodies.keys(),
    ]);
    const sorted = [...numbers].sort(compareProblemNumbers);
    let bothUnchanged = 0;
    let bothChanged = 0;
    let liveOnly = 0;
    let previewOnly = 0;

    const rows = sorted.map((problemNumber) => {
      const liveBody = liveBodies.get(problemNumber) ?? null;
      const previewBody = previewBodies.get(problemNumber) ?? null;

      let presence: Presence;
      if (liveBody !== null && previewBody !== null) {
        presence = "both";
      } else if (liveBody !== null) {
        presence = "liveOnly";
      } else {
        presence = "previewOnly";
      }

      const contentChanged =
        liveBody !== null &&
        previewBody !== null &&
        !contentEqual(liveBody, previewBody);

      const liveLetters =
        liveBody !== null ? listSubproblemLetters(liveBody.problem) : [];
      const previewLetters =
        previewBody !== null ? listSubproblemLetters(previewBody.problem) : [];
      const lettersChanged =
        presence === "both" &&
        !sameStringArray([...liveLetters].sort(), [...previewLetters].sort());

      if (presence === "both") {
        if (contentChanged) bothChanged += 1;
        else bothUnchanged += 1;
      } else if (presence === "liveOnly") {
        liveOnly += 1;
      } else {
        previewOnly += 1;
      }

      const { defaultAction, allowedActions } = defaultAndAllowed(
        presence,
        contentChanged,
      );

      return {
        problemNumber,
        presence,
        contentChanged,
        lettersChanged,
        defaultAction,
        allowedActions,
        live: liveBody !== null ? toSideSummary(liveBody) : null,
        preview: previewBody !== null ? toSideSummary(previewBody) : null,
        shadowCount: shadowCounts.get(problemNumber) ?? 0,
      };
    });

    return {
      contentHash: run.contentHash,
      runName: run.name,
      rows,
      summary: { bothUnchanged, bothChanged, liveOnly, previewOnly },
    };
  },
});

export const getLiveSnapshotInternal = internalQuery({
  args: { contentHash: v.string() },
  returns: v.object({
    problems: v.array(
      v.object({
        problemNumber: v.string(),
        problem: v.string(),
        answer: v.string(),
        flags: v.array(problemFlagValidator),
        sourceQuestionPageIdx: v.optional(v.number()),
        sourceAnswerPageIdx: v.optional(v.number()),
        questionImages: v.optional(v.array(problemImageStorageValidator)),
        answerImages: v.optional(v.array(problemImageStorageValidator)),
        shadowCount: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { bodies, shadowCounts } = await loadLiveBodies(
      ctx,
      args.contentHash,
    );
    return {
      problems: [...bodies.values()]
        .sort((a, b) =>
          compareProblemNumbers(a.problemNumber, b.problemNumber),
        )
        .map((body) => ({
          ...bodyToReplaceRow(body),
          flags: body.flags,
          shadowCount: shadowCounts.get(body.problemNumber) ?? 0,
        })),
    };
  },
});

const decisionInputValidator = v.object({
  problemNumber: v.string(),
  action: decisionActionValidator,
});

export const estimateImpact = query({
  args: {
    contentHash: v.string(),
    decisions: v.array(decisionInputValidator),
    /** Preview letter structure for replace rows (from client diff). */
    previewLettersByNumber: v.array(
      v.object({
        problemNumber: v.string(),
        letters: v.array(v.string()),
        question: v.string(),
      }),
    ),
  },
  returns: v.union(impactValidator, v.null()),
  handler: async (ctx, args) => {
    if ((await softRequireAdmin(ctx)) === null) {
      return null;
    }

    const decisions = new Map<string, DecisionAction>();
    for (const d of args.decisions) {
      decisions.set(d.problemNumber, d.action);
    }

    const previewBodies = new Map<string, ProblemBody>();
    for (const row of args.previewLettersByNumber) {
      previewBodies.set(row.problemNumber, {
        problemNumber: row.problemNumber,
        problem: row.question,
        answer: "",
        flags: [],
      });
    }

    const { bodies: liveBodies, shadowCounts } = await loadLiveBodies(
      ctx,
      args.contentHash,
    );

    let keepCount = 0;
    let replaceCount = 0;
    let deleteCount = 0;
    let addCount = 0;
    let skipCount = 0;
    let shadowsDropped = 0;

    for (const [number, action] of decisions) {
      if (action === "keep") keepCount += 1;
      else if (action === "replace") replaceCount += 1;
      else if (action === "delete") deleteCount += 1;
      else if (action === "add") addCount += 1;
      else skipCount += 1;

      // v1 full replace remints every live parent → all shadows drop.
      if (liveBodies.has(number)) {
        shadowsDropped += shadowCounts.get(number) ?? 0;
      }
    }

    const starRows = await ctx.db
      .query("roomProblemStars")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", args.contentHash))
      .take(MAX_PROGRESS_ROWS);
    const completionRows = await ctx.db
      .query("roomProblemCompletions")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", args.contentHash))
      .take(MAX_PROGRESS_ROWS);
    const assignmentRows = await ctx.db
      .query("roomOccasionAssignments")
      .withIndex("by_contentHash", (q) => q.eq("contentHash", args.contentHash))
      .take(MAX_PROGRESS_ROWS);

    return {
      orphanStars: countOrphansForDecisions(
        starRows,
        liveBodies,
        previewBodies,
        decisions,
      ),
      orphanCompletions: countOrphansForDecisions(
        completionRows,
        liveBodies,
        previewBodies,
        decisions,
      ),
      orphanAssignments: countOrphansForDecisions(
        assignmentRows,
        liveBodies,
        previewBodies,
        decisions,
      ),
      shadowsDropped,
      deleteCount,
      replaceCount,
      keepCount,
      addCount,
      skipCount,
    };
  },
});

export const checkPublishAllowedInternal = internalQuery({
  args: {
    contentHash: v.string(),
    runId: v.id("pdfAdminRuns"),
  },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const adminRuns = await ctx.db
      .query("pdfAdminRuns")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .order("desc")
      .take(MAX_ADMIN_RUNS_LOOKUP);

    const activeAdmin = adminRuns.find(
      (run) =>
        run._id !== args.runId &&
        (run.status === "pending" || run.status === "running"),
    );
    if (activeAdmin !== undefined) {
      return {
        ok: false as const,
        reason: "En annan admin-körning pågår för samma PDF",
      };
    }

    const jobs = await ctx.db
      .query("pdfParseJobs")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .order("desc")
      .take(MAX_JOBS_LOOKUP);
    const activeJob = jobs.find(
      (job) =>
        (job.kind ?? "problems") === "problems" &&
        (job.status === "pending" || job.status === "running"),
    );
    if (activeJob !== undefined) {
      return {
        ok: false as const,
        reason: "En rumstolkning pågår för samma PDF",
      };
    }

    return { ok: true as const };
  },
});

export const publishMerged = action({
  args: {
    runId: v.id("pdfAdminRuns"),
    decisions: v.array(decisionInputValidator),
  },
  returns: v.object({
    publishedCount: v.number(),
    contentHash: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ publishedCount: number; contentHash: string }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }
    const adminId: Id<"users"> | null = await ctx.runQuery(
      internal.PDFParse.adminParse.getAdminUserIdInternal,
      {},
    );
    if (adminId === null) {
      throw new Error("Endast admin");
    }

    const run: AdminRunInternal = await ctx.runQuery(
      internal.PDFParse.adminParse.getInternal,
      { runId: args.runId },
    );
    if (run === null) {
      throw new Error("Körningen hittades inte");
    }
    if (run.kind !== "problems") {
      throw new Error("Publicering via diff finns bara för uppgifter");
    }
    if (run.previewStorageId === null) {
      throw new Error("Ingen förhandsgranskning");
    }
    if (run.status === "pending" || run.status === "running") {
      throw new Error("Körningen pågår fortfarande");
    }

    const allowed: PublishAllowed = await ctx.runQuery(
      internal.PDFParse.adminReparse.checkPublishAllowedInternal,
      { contentHash: run.contentHash, runId: args.runId },
    );
    if (!allowed.ok) {
      throw new Error(allowed.reason);
    }

    const blob = await ctx.storage.get(run.previewStorageId);
    if (blob === null) {
      throw new Error("Förhandsgranskningen hittades inte");
    }
    const payload = parsePreviewPayload(JSON.parse(await blob.text()));
    if (payload.kind !== "problems") {
      throw new Error("Förhandsgranskningen är inte uppgifter");
    }

    const live: LiveSnapshot = await ctx.runQuery(
      internal.PDFParse.adminReparse.getLiveSnapshotInternal,
      { contentHash: run.contentHash },
    );
    const liveBodies = new Map<string, ProblemBody>();
    for (const p of live.problems) {
      liveBodies.set(p.problemNumber, snapshotToBody(p));
    }

    const previewBodies = new Map<string, ProblemBody>();
    for (const p of payload.problems) {
      previewBodies.set(p.problemNumber, previewToBody(p));
    }

    const decisions = new Map<string, DecisionAction>();
    for (const d of args.decisions) {
      decisions.set(d.problemNumber, d.action);
    }

    // Every live + preview number must have a decision.
    const allNumbers = new Set<string>([
      ...liveBodies.keys(),
      ...previewBodies.keys(),
    ]);
    for (const number of allNumbers) {
      if (!decisions.has(number)) {
        throw new Error(`Saknar beslut för uppgift ${number}`);
      }
    }
    for (const number of decisions.keys()) {
      if (!allNumbers.has(number)) {
        throw new Error(`Okänt problemnummer i beslut: ${number}`);
      }
    }

    const merged: Array<ReturnType<typeof bodyToReplaceRow>> = [];

    for (const number of [...allNumbers].sort(compareProblemNumbers)) {
      const action = decisions.get(number)!;
      const liveBody = liveBodies.get(number);
      const previewBody = previewBodies.get(number);

      if (action === "skip" || action === "delete") {
        if (action === "skip" && liveBody !== undefined) {
          throw new Error(`skip ogiltigt för befintlig uppgift ${number}`);
        }
        if (action === "delete" && liveBody === undefined) {
          throw new Error(`delete ogiltigt för ny uppgift ${number}`);
        }
        continue;
      }

      if (action === "keep") {
        if (liveBody === undefined) {
          throw new Error(`keep kräver live-rad för ${number}`);
        }
        merged.push(bodyToReplaceRow(liveBody));
        continue;
      }

      if (action === "replace" || action === "add") {
        if (previewBody === undefined) {
          throw new Error(`${action} kräver förhandsgranskning för ${number}`);
        }
        if (action === "replace" && liveBody === undefined) {
          throw new Error(`replace kräver live-rad för ${number}`);
        }
        if (action === "add" && liveBody !== undefined) {
          throw new Error(`add ogiltigt för befintlig uppgift ${number}`);
        }
        merged.push(bodyToReplaceRow(previewBody));
        continue;
      }
    }

    await ctx.runMutation(internal.PDFParse.problems.replaceForContentHash, {
      contentHash: run.contentHash,
      problems: merged,
    });

    await ctx.runMutation(internal.PDFParse.adminReparse.markPublished, {
      runId: args.runId,
      publishedCount: merged.length,
    });

    return {
      publishedCount: merged.length,
      contentHash: run.contentHash,
    };
  },
});

export const markPublished = internalMutation({
  args: {
    runId: v.id("pdfAdminRuns"),
    publishedCount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null) {
      return null;
    }
    const statusUpdates = [
      ...run.statusUpdates,
      {
        message: `Publicerade ${args.publishedCount} uppgifter via diff`,
        at: Date.now(),
      },
    ].slice(-40);

    await ctx.db.patch(args.runId, {
      problemCount: args.publishedCount,
      statusUpdates,
      error: undefined,
    });
    return null;
  },
});
