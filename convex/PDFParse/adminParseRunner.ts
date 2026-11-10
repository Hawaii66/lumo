import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction, type ActionCtx } from "../_generated/server";
import type { LumoParsedProblem } from "../lib/lumoContent";
import {
  parseCachedMiddleJsonToInfo,
  parseCachedMiddleJsonToProblems,
  parsePdfBytesToInfo,
  parsePdfBytesToProblems,
} from "./pdfParse";

type PreviewPayload =
  | { kind: "problems"; problems: LumoParsedProblem[] }
  | { kind: "info"; text: string };

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
      }

      await report("Hämtar PDF…", {
        status: "running",
        stage: run.fromStage === "ai" ? "ai" : "mineru",
      });

      const blob = await ctx.storage.get(run.storageId);
      if (blob === null) {
        throw new Error("PDF-filen hittades inte i lagringen");
      }
      const pdfBytes = await blob.arrayBuffer();
      const blobType = blob.type || "application/pdf";

      let payload: PreviewPayload;

      if (run.kind === "problems") {
        await report(
          run.fromStage === "ai"
            ? "Tolkar uppgifter från MinerU-cache…"
            : "Tolkar PDF (MinerU + AI)…",
          { stage: run.fromStage === "ai" ? "ai" : "mineru" },
        );
        const problems =
          run.fromStage === "ai"
            ? await parseCachedMiddleJsonToProblems(
                ctx,
                run.createdBy,
                run.contentHash,
                async (message, options) => {
                  await report(message, {
                    stage: "ai",
                    replaceLast: options?.replaceLast,
                  });
                },
              )
            : await parsePdfBytesToProblems(
                ctx,
                run.createdBy,
                pdfBytes,
                run.contentHash,
                blobType,
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
        payload = { kind: "problems", problems };
      } else {
        await report(
          run.fromStage === "ai"
            ? "Tolkar information från MinerU-cache…"
            : "Tolkar PDF-information (MinerU + AI)…",
          { stage: run.fromStage === "ai" ? "ai" : "mineru" },
        );
        const text =
          run.fromStage === "ai"
            ? await parseCachedMiddleJsonToInfo(
                ctx,
                run.createdBy,
                run.contentHash,
                async (message, options) => {
                  await report(message, {
                    stage: "ai",
                    replaceLast: options?.replaceLast,
                  });
                },
              )
            : await parsePdfBytesToInfo(
                ctx,
                run.createdBy,
                pdfBytes,
                run.contentHash,
                blobType,
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
        payload = { kind: "info", text };
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
