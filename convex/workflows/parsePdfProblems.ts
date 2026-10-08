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
import { internalAction, internalMutation } from "../_generated/server";
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
    });
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

export const extractProblemList = internalAction({
  args: {
    jobId: v.id("parseJobs"),
    mergedStorageId: v.id("_storage"),
    userId: v.id("users"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{ number: string; question: string; answer?: string }>
  > => {
    await ctx.runMutation(internal.workflows.parsePdfProblems.setJobStatus, {
      jobId: args.jobId,
      status: "extracting",
    });

    const blob = await ctx.storage.get(args.mergedStorageId);
    if (blob === null) {
      throw new Error("Den sammanslagna PDF:en hittades inte");
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());

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
                text: "Extrahera alla matematikuppgifter från denna PDF. Svara enligt schemat.",
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

    return object.problems.slice(0, MAX_PROBLEMS_PER_JOB).map((problem) => {
      const answer = problem.answer?.trim() ?? "";
      return {
        number: problem.number.trim(),
        question: problem.question.trim(),
        ...(answer.length > 0 ? { answer } : {}),
      };
    });
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
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<Array<Id<"problems">>> => {
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

    const problems = await step.runAction(
      internal.workflows.parsePdfProblems.extractProblemList,
      {
        jobId: args.jobId,
        mergedStorageId: args.mergedStorageId,
        userId: args.userId,
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

    await step.runMutation(internal.workflows.parsePdfProblems.completeJob, {
      jobId: args.jobId,
    });
  },
});
