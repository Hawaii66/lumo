import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import {
  flagsForDisplay,
  type LumoParsedProblemWithImages,
} from "../lib/lumoContent";
import {
  parseCachedMiddleJsonToInfo,
  parseCachedMiddleJsonToProblems,
  parsePdfToInfo,
  parsePdfToProblems,
} from "./pdfParse";

type PreviewImage = {
  storageId: Id<"_storage">;
  url: string;
  subproblemLetter?: string;
};

type PreviewProblem = Omit<
  LumoParsedProblemWithImages,
  "questionImages" | "answerImages"
> & {
  questionImages?: Array<PreviewImage>;
  answerImages?: Array<PreviewImage>;
};

type PreviewPayload =
  | { kind: "problems"; problems: PreviewProblem[] }
  | { kind: "info"; text: string };

async function resolvePreviewImages(
  ctx: ActionCtx,
  images: Array<{ storageId: string; subproblemLetter?: string }> | undefined,
): Promise<Array<PreviewImage>> {
  if (images === undefined || images.length === 0) {
    return [];
  }
  const out: Array<PreviewImage> = [];
  for (const image of images) {
    const storageId = image.storageId as Id<"_storage">;
    const url = await ctx.storage.getUrl(storageId);
    if (url !== null) {
      const letter = (image.subproblemLetter ?? "").trim().toLowerCase();
      out.push({
        storageId,
        url,
        ...(letter.length > 0 ? { subproblemLetter: letter } : {}),
      });
    }
  }
  return out;
}

async function toPreviewProblems(
  ctx: ActionCtx,
  problems: LumoParsedProblemWithImages[],
): Promise<PreviewProblem[]> {
  const out: PreviewProblem[] = [];
  for (const problem of problems) {
    const questionImages = await resolvePreviewImages(
      ctx,
      problem.questionImages,
    );
    const answerImages = await resolvePreviewImages(ctx, problem.answerImages);
    out.push({
      problemNumber: problem.problemNumber,
      question: problem.question,
      answer: problem.answer,
      flags: flagsForDisplay(problem.flags, questionImages.length),
      ...(problem.sourceQuestionPageIdx !== undefined
        ? { sourceQuestionPageIdx: problem.sourceQuestionPageIdx }
        : {}),
      ...(problem.sourceAnswerPageIdx !== undefined
        ? { sourceAnswerPageIdx: problem.sourceAnswerPageIdx }
        : {}),
      ...(questionImages.length > 0 ? { questionImages } : {}),
      ...(answerImages.length > 0 ? { answerImages } : {}),
    });
  }
  return out;
}

async function storePreview(
  ctx: ActionCtx,
  runId: Id<"pdfAdminRuns">,
  payload: PreviewPayload,
): Promise<Id<"_storage">> {
  const blob = new Blob([JSON.stringify(payload)], {
    type: "application/json",
  });
  const previewStorageId = await ctx.storage.store(blob);
  await ctx.runMutation(internal.PDFParse.adminParse.savePreview, {
    runId,
    previewStorageId,
    problemCount:
      payload.kind === "problems" ? payload.problems.length : undefined,
  });
  return previewStorageId;
}

async function loadPreview(
  ctx: ActionCtx,
  previewStorageId: Id<"_storage">,
  kind: "problems" | "info",
): Promise<PreviewPayload> {
  const blob = await ctx.storage.get(previewStorageId);
  if (blob === null) {
    throw new Error("Förhandsgranskningen hittades inte");
  }
  const raw: unknown = JSON.parse(await blob.text());
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("kind" in raw) ||
    (raw as { kind: unknown }).kind !== kind
  ) {
    throw new Error("Förhandsgranskningen har fel format");
  }
  return raw as PreviewPayload;
}

async function commitPreview(
  ctx: ActionCtx,
  contentHash: string,
  payload: PreviewPayload,
): Promise<number | undefined> {
  if (payload.kind === "problems") {
    await ctx.runMutation(internal.PDFParse.problems.replaceForContentHash, {
      contentHash,
      problems: payload.problems.map((p) => ({
        problemNumber: p.problemNumber,
        problem: p.question,
        answer: p.answer,
        flags: p.flags,
        ...(p.sourceQuestionPageIdx !== undefined
          ? { sourceQuestionPageIdx: p.sourceQuestionPageIdx }
          : {}),
        ...(p.sourceAnswerPageIdx !== undefined
          ? { sourceAnswerPageIdx: p.sourceAnswerPageIdx }
          : {}),
        questionImages: p.questionImages?.map((img) => ({
          storageId: img.storageId,
          ...(img.subproblemLetter !== undefined &&
          img.subproblemLetter.length > 0
            ? { subproblemLetter: img.subproblemLetter }
            : {}),
        })),
        answerImages: p.answerImages?.map((img) => ({
          storageId: img.storageId,
          ...(img.subproblemLetter !== undefined &&
          img.subproblemLetter.length > 0
            ? { subproblemLetter: img.subproblemLetter }
            : {}),
        })),
      })),
    });
    return payload.problems.length;
  }
  await ctx.runMutation(internal.PDFParse.pdfInfo.replaceForContentHash, {
    contentHash,
    text: payload.text,
  });
  return undefined;
}

/**
 * Admin sandbox runner: always produces a preview; commits only when commitToDb.
 * Supports restart from mineru / ai / commit.
 * MinerU waits via scheduled polls; this action exits on pending and resumes
 * when `mineruJobs` re-schedules the run after cache is written.
 */
export const runAdminParse = internalAction({
  args: { runId: v.id("pdfAdminRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runQuery(internal.PDFParse.adminParse.getInternal, {
      runId: args.runId,
    });
    if (run === null) {
      return null;
    }
    if (run.status === "done" || run.status === "failed") {
      return null;
    }

    const report = async (
      message: string,
      options?: {
        status?: "pending" | "running" | "done" | "failed";
        stage?: "queued" | "mineru" | "ai" | "commit" | "done";
        replaceLast?: boolean;
      },
    ) => {
      await ctx.runMutation(internal.PDFParse.adminParse.appendStatus, {
        runId: args.runId,
        message,
        status: options?.status,
        stage: options?.stage,
        replaceLast: options?.replaceLast,
      });
    };

    try {
      if (run.fromStage === "commit") {
        if (run.previewStorageId === null) {
          throw new Error("Ingen förhandsgranskning att spara");
        }
        await report("Sparar till databasen…", {
          status: "running",
          stage: "commit",
        });
        const preview = await loadPreview(
          ctx,
          run.previewStorageId,
          run.kind,
        );
        const count = await commitPreview(ctx, run.contentHash, preview);
        await ctx.runMutation(internal.PDFParse.adminParse.markDone, {
          runId: args.runId,
          problemCount: count,
        });
        return null;
      }

      if (run.invalidateMineru && run.fromStage === "mineru") {
        await report("Rensar MinerU-cache…", {
          status: "running",
          stage: "mineru",
        });
        await ctx.runMutation(
          internal.PDFParse.mineruCache.deleteByContentHash,
          { contentHash: run.contentHash },
        );
        await ctx.runMutation(
          internal.PDFParse.adminParse.clearInvalidateMineru,
          { runId: args.runId },
        );
      }

      await report("Hämtar PDF…", {
        status: "running",
        stage: run.fromStage === "ai" ? "ai" : "mineru",
      });

      let payload: PreviewPayload;

      if (run.kind === "problems") {
        if (run.fromStage === "ai") {
          await report("Tolkar uppgifter från MinerU-cache…", {
            stage: "ai",
          });
          const problems = await parseCachedMiddleJsonToProblems(
            ctx,
            run.createdBy,
            run.contentHash,
            async (message, options) => {
              await report(message, {
                stage: "ai",
                replaceLast: options?.replaceLast,
              });
            },
          );
          payload = {
            kind: "problems",
            problems: await toPreviewProblems(ctx, problems),
          };
        } else {
          await report("Tolkar PDF (MinerU + AI)…", { stage: "mineru" });
          const outcome = await parsePdfToProblems(
            ctx,
            run.createdBy,
            run.contentHash,
            run.storageId,
            { type: "adminRun", runId: args.runId },
            async (message, options) => {
              const stage =
                message.startsWith("Tolkar uppgifter med AI") ||
                message.startsWith("Delar upp")
                  ? "ai"
                  : "mineru";
              await report(message, {
                stage,
                replaceLast: options?.replaceLast,
              });
            },
          );
          if (outcome.status === "mineru_pending") {
            return null;
          }
          payload = {
            kind: "problems",
            problems: await toPreviewProblems(ctx, outcome.value),
          };
        }
      } else if (run.fromStage === "ai") {
        await report("Tolkar information från MinerU-cache…", {
          stage: "ai",
        });
        const text = await parseCachedMiddleJsonToInfo(
          ctx,
          run.createdBy,
          run.contentHash,
          async (message, options) => {
            await report(message, {
              stage: "ai",
              replaceLast: options?.replaceLast,
            });
          },
        );
        payload = { kind: "info", text };
      } else {
        await report("Tolkar PDF-information (MinerU + AI)…", {
          stage: "mineru",
        });
        const outcome = await parsePdfToInfo(
          ctx,
          run.createdBy,
          run.contentHash,
          run.storageId,
          { type: "adminRun", runId: args.runId },
          async (message, options) => {
            const stage =
              message.startsWith("Tolkar information") ||
              message.startsWith("Sammanställer")
                ? "ai"
                : "mineru";
            await report(message, {
              stage,
              replaceLast: options?.replaceLast,
            });
          },
        );
        if (outcome.status === "mineru_pending") {
          return null;
        }
        payload = { kind: "info", text: outcome.value };
      }

      await report("Sparar förhandsgranskning…", { stage: "ai" });
      await storePreview(ctx, args.runId, payload);

      if (run.commitToDb) {
        await report("Sparar till databasen…", { stage: "commit" });
        const count = await commitPreview(ctx, run.contentHash, payload);
        await ctx.runMutation(internal.PDFParse.adminParse.markDone, {
          runId: args.runId,
          problemCount: count,
        });
      } else {
        await ctx.runMutation(internal.PDFParse.adminParse.markDone, {
          runId: args.runId,
          problemCount:
            payload.kind === "problems"
              ? payload.problems.length
              : undefined,
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Okänt fel vid tolkning";
      await ctx.runMutation(internal.PDFParse.adminParse.markFailed, {
        runId: args.runId,
        error: message,
      });
    }

    return null;
  },
});
