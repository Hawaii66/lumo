import { v } from "convex/values";
import {
  problemFormatAgent,
  problemFormatSchema,
} from "../agents/problemFormatAgent";
import {
  problemListAgent,
  problemListSchema,
} from "../agents/problemListAgent";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import {
  expandPageRanges,
  mergedPageToOriginal,
  subtractPages,
} from "../lib/pageRanges";
import { pageHasAllProblemsReady } from "../lib/parsedPageCompletion";
import { sha256Hex } from "../lib/pdfHash";
import { workflow } from "../lib/workflow";
import type { Id } from "../_generated/dataModel";

const MAX_PROBLEMS_PER_JOB = 80;

export const setJobStatus = internalMutation({
  args: {
    jobId: v.id("parseJobs"),
    status: v.union(
      v.literal("pending"),
      v.literal("hashing"),
      v.literal("extracting"),
      v.literal("converting"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    pdfHash: v.optional(v.string()),
    error: v.optional(v.string()),
    problemCount: v.optional(v.number()),
    skippedCount: v.optional(v.number()),
    skippedPageCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get("parseJobs", args.jobId);
    if (job === null) {
      throw new Error("Parse-jobbet hittades inte");
    }
    await ctx.db.patch("parseJobs", args.jobId, {
      status: args.status,
      ...(args.pdfHash !== undefined ? { pdfHash: args.pdfHash } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.problemCount !== undefined
        ? { problemCount: args.problemCount }
        : {}),
      ...(args.skippedCount !== undefined
        ? { skippedCount: args.skippedCount }
        : {}),
      ...(args.skippedPageCount !== undefined
        ? { skippedPageCount: args.skippedPageCount }
        : {}),
    });
  },
});

export const getJobInternal = internalQuery({
  args: { jobId: v.id("parseJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get("parseJobs", args.jobId);
  },
});

export const hashOriginalPdf = internalAction({
  args: {
    jobId: v.id("parseJobs"),
    fileId: v.id("files"),
  },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runMutation(internal.workflows.parsePdfProblems.setJobStatus, {
      jobId: args.jobId,
      status: "hashing",
    });

    const file = await ctx.runQuery(internal.problems.getFileInternal, {
      fileId: args.fileId,
    });
    if (file === null) {
      throw new Error("PDF-filen hittades inte");
    }

    const blob = await ctx.storage.get(file.storageId);
    if (blob === null) {
      throw new Error("PDF-innehållet hittades inte i lagringen");
    }

    const pdfHash = await sha256Hex(await blob.arrayBuffer());
    await ctx.runMutation(internal.workflows.parsePdfProblems.setJobStatus, {
      jobId: args.jobId,
      status: "extracting",
      pdfHash,
    });
    return pdfHash;
  },
});

export const resolvePagesToProcess = internalMutation({
  args: {
    jobId: v.id("parseJobs"),
    pdfHash: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ pagesToProcess: Array<number>; skippedPageCount: number }> => {
    const job = await ctx.db.get("parseJobs", args.jobId);
    if (job === null) {
      throw new Error("Parse-jobbet hittades inte");
    }

    const requested = expandPageRanges(job.pageRanges);
    const completedRows = await ctx.db
      .query("parsedPages")
      .withIndex("by_pdfHash", (q) => q.eq("pdfHash", args.pdfHash))
      .take(500);

    const trulyCompleted = new Set<number>();
    for (const row of completedRows) {
      if (await pageHasAllProblemsReady(ctx, args.pdfHash, row.pageNumber)) {
        trulyCompleted.add(row.pageNumber);
      } else {
        // Drop stale completion marks from earlier buggy runs.
        await ctx.db.delete("parsedPages", row._id);
      }
    }

    const pagesToProcess = subtractPages(requested, trulyCompleted);
    const skippedPageCount = requested.length - pagesToProcess.length;

    await ctx.db.patch("parseJobs", args.jobId, {
      skippedPageCount,
      ...(pagesToProcess.length === 0
        ? {
            status: "completed" as const,
            problemCount: 0,
            skippedCount: 0,
          }
        : {}),
    });

    return { pagesToProcess, skippedPageCount };
  },
});

export const extractProblemList = internalAction({
  args: {
    jobId: v.id("parseJobs"),
    mergedStorageId: v.id("_storage"),
    userId: v.id("users"),
    pagesToProcess: v.array(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      number: string;
      question: string;
      answer?: string;
      sourcePage: number;
    }>
  > => {
    await ctx.runMutation(internal.workflows.parsePdfProblems.setJobStatus, {
      jobId: args.jobId,
      status: "extracting",
    });

    const job = await ctx.runQuery(
      internal.workflows.parsePdfProblems.getJobInternal,
      { jobId: args.jobId },
    );
    if (job === null) {
      throw new Error("Parse-jobbet hittades inte");
    }

    const blob = await ctx.storage.get(args.mergedStorageId);
    if (blob === null) {
      throw new Error("Den sammanslagna PDF:en hittades inte");
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mapping = mergedPageToOriginal(job.pageRanges);
    const mappingLines = mapping
      .map(
        (originalPage, index) =>
          `Sammanslagen sida ${index + 1} = original sida ${originalPage}`,
      )
      .join("\n");
    const allowed = args.pagesToProcess.join(", ");
    const pagesToProcessSet = new Set(args.pagesToProcess);

    const { object } = await problemListAgent.generateObject(
      ctx,
      { userId: args.userId },
      {
        schema: problemListSchema,
        prompt: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Extrahera matematikuppgifter från denna PDF.",
                  "",
                  "Sidmappning (sammanslagen → original):",
                  mappingLines,
                  "",
                  `Bearbeta ENDAST originalsidor: ${allowed}`,
                  "Hoppa över alla andra sidor (redan tolkade eller ej tillåtna).",
                  "Varje problem måste ha sourcePage = original sidnummer.",
                  "Svara enligt schemat.",
                ].join("\n"),
              },
              {
                type: "file",
                data: bytes,
                mediaType: "application/pdf",
                filename: "merged-pages.pdf",
              },
            ],
          },
        ],
      },
      { storageOptions: { saveMessages: "none" } },
    );

    return object.problems
      .slice(0, MAX_PROBLEMS_PER_JOB)
      .map((problem) => {
        const answer = problem.answer?.trim() ?? "";
        return {
          number: problem.number.trim(),
          question: problem.question.trim(),
          sourcePage: problem.sourcePage,
          ...(answer.length > 0 ? { answer } : {}),
        };
      })
      .filter(
        (problem) =>
          problem.number.length > 0 &&
          problem.question.length > 0 &&
          Number.isInteger(problem.sourcePage) &&
          pagesToProcessSet.has(problem.sourcePage),
      );
  },
});

export const filterAndInsertProblems = internalMutation({
  args: {
    jobId: v.id("parseJobs"),
    pdfHash: v.string(),
    fileId: v.id("files"),
    roomId: v.id("rooms"),
    problems: v.array(
      v.object({
        number: v.string(),
        question: v.string(),
        answer: v.optional(v.string()),
        sourcePage: v.number(),
      }),
    ),
  },
  handler: async (ctx, args): Promise<Array<Id<"problems">>> => {
    const newIds: Array<Id<"problems">> = [];
    let skipped = 0;

    for (const problem of args.problems) {
      if (problem.number.length === 0 || problem.question.length === 0) {
        continue;
      }

      const existing = await ctx.db
        .query("problems")
        .withIndex("by_pdfHash_and_number", (q) =>
          q.eq("pdfHash", args.pdfHash).eq("problemNumber", problem.number),
        )
        .unique();

      if (existing !== null) {
        skipped += 1;
        continue;
      }

      const id = await ctx.db.insert("problems", {
        pdfHash: args.pdfHash,
        problemNumber: problem.number,
        questionRaw: problem.question,
        answerRaw: problem.answer,
        sourcePage: problem.sourcePage,
        segments: [],
        fileId: args.fileId,
        roomId: args.roomId,
        status: "pending",
      });
      newIds.push(id);
    }

    await ctx.db.patch("parseJobs", args.jobId, {
      status: "converting",
      problemCount: newIds.length,
      skippedCount: skipped,
    });

    return newIds;
  },
});

export const formatProblem = internalAction({
  args: {
    problemId: v.id("problems"),
    userId: v.id("users"),
  },
  handler: async (ctx, args): Promise<void> => {
    const problem = await ctx.runQuery(internal.problems.getInternal, {
      problemId: args.problemId,
    });
    if (problem === null) {
      throw new Error("Uppgiften hittades inte");
    }

    try {
      const promptParts = [
        `Uppgift ${problem.problemNumber}:`,
        problem.questionRaw,
      ];
      if (problem.answerRaw) {
        promptParts.push("", `Svar/facit:`, problem.answerRaw);
      }
      promptParts.push(
        "",
        "Konvertera till segments (och answerSegments om svar finns).",
      );

      const { object } = await problemFormatAgent.generateObject(
        ctx,
        { userId: args.userId },
        {
          schema: problemFormatSchema,
          prompt: promptParts.join("\n"),
        },
        { storageOptions: { saveMessages: "none" } },
      );

      await ctx.runMutation(internal.problems.markReady, {
        problemId: args.problemId,
        segments: object.segments,
        ...(object.answerSegments !== null && object.answerSegments.length > 0
          ? { answerSegments: object.answerSegments }
          : {}),
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Formatering misslyckades";
      await ctx.runMutation(internal.problems.markFailed, {
        problemId: args.problemId,
        error: message,
      });
    }
  },
});

export const finalizeCompletedPages = internalMutation({
  args: {
    pdfHash: v.string(),
    pagesToProcess: v.array(v.number()),
  },
  handler: async (ctx, args): Promise<Array<number>> => {
    const completedPages: Array<number> = [];

    for (const pageNumber of args.pagesToProcess) {
      // Use all problems on the page (including ones skipped as already
      // present), not only newly inserted IDs from this job.
      if (!(await pageHasAllProblemsReady(ctx, args.pdfHash, pageNumber))) {
        continue;
      }

      completedPages.push(pageNumber);
      const existing = await ctx.db
        .query("parsedPages")
        .withIndex("by_pdfHash_and_page", (q) =>
          q.eq("pdfHash", args.pdfHash).eq("pageNumber", pageNumber),
        )
        .unique();
      if (existing === null) {
        await ctx.db.insert("parsedPages", {
          pdfHash: args.pdfHash,
          pageNumber,
        });
      }
    }

    return completedPages;
  },
});

export const completeJob = internalMutation({
  args: {
    jobId: v.id("parseJobs"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("parseJobs", args.jobId, {
      status: "completed",
    });
  },
});

export const parsePdfProblems = workflow.define({
  args: {
    jobId: v.id("parseJobs"),
    fileId: v.id("files"),
    mergedStorageId: v.id("_storage"),
    roomId: v.id("rooms"),
    userId: v.id("users"),
  },
  handler: async (step, args): Promise<void> => {
    const pdfHash = await step.runAction(
      internal.workflows.parsePdfProblems.hashOriginalPdf,
      { jobId: args.jobId, fileId: args.fileId },
      { retry: true },
    );

    const { pagesToProcess } = await step.runMutation(
      internal.workflows.parsePdfProblems.resolvePagesToProcess,
      { jobId: args.jobId, pdfHash },
    );

    if (pagesToProcess.length === 0) {
      return;
    }

    const problems = await step.runAction(
      internal.workflows.parsePdfProblems.extractProblemList,
      {
        jobId: args.jobId,
        mergedStorageId: args.mergedStorageId,
        userId: args.userId,
        pagesToProcess,
      },
      { retry: true },
    );

    const newProblemIds = await step.runMutation(
      internal.workflows.parsePdfProblems.filterAndInsertProblems,
      {
        jobId: args.jobId,
        pdfHash,
        fileId: args.fileId,
        roomId: args.roomId,
        problems,
      },
    );

    if (newProblemIds.length > 0) {
      await Promise.all(
        newProblemIds.map((problemId) =>
          step.runAction(
            internal.workflows.parsePdfProblems.formatProblem,
            { problemId, userId: args.userId },
            { retry: true },
          ),
        ),
      );
    }

    await step.runMutation(
      internal.workflows.parsePdfProblems.finalizeCompletedPages,
      {
        pdfHash,
        pagesToProcess,
      },
    );

    await step.runMutation(internal.workflows.parsePdfProblems.completeJob, {
      jobId: args.jobId,
    });
  },
});
