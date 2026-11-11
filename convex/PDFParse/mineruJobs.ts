import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import {
  downloadMineruZipBytes,
  fetchMineruTaskDetail,
  MINERU_DEADLINE_MS,
  MINERU_POLL_INTERVAL_MS,
  parseMineruZip,
  startMineruTask,
} from "./mineruClient";
import type { MineruWaiter } from "./mineruCache";

async function failWaiters(
  ctx: ActionCtx,
  waiters: MineruWaiter[],
  error: string,
): Promise<void> {
  for (const waiter of waiters) {
    if (waiter.type === "parseJob") {
      await ctx.runMutation(internal.PDFParse.jobs.markFailed, {
        jobId: waiter.jobId,
        error,
      });
    } else {
      await ctx.runMutation(internal.PDFParse.adminParse.markFailed, {
        runId: waiter.runId,
        error,
      });
    }
  }
}

async function resumeWaiters(
  ctx: ActionCtx,
  waiters: MineruWaiter[],
): Promise<void> {
  for (const waiter of waiters) {
    if (waiter.type === "parseJob") {
      const job: { status: string } | null = await ctx.runQuery(
        internal.PDFParse.jobs.getInternal,
        { jobId: waiter.jobId },
      );
      if (job === null || job.status === "done" || job.status === "failed") {
        continue;
      }
      await ctx.scheduler.runAfter(0, internal.PDFParse.pdfParse.runParseJob, {
        jobId: waiter.jobId,
      });
    } else {
      const run: { status: string } | null = await ctx.runQuery(
        internal.PDFParse.adminParse.getInternal,
        { runId: waiter.runId },
      );
      if (run === null || run.status === "done" || run.status === "failed") {
        continue;
      }
      await ctx.scheduler.runAfter(
        0,
        internal.PDFParse.adminParseRunner.runAdminParse,
        { runId: waiter.runId },
      );
    }
  }
}

/**
 * Create+upload MinerU task (if needed) and schedule the first status poll.
 * Idempotent when taskId already exists on the in-flight row.
 */
export const startMineruFetch = internalAction({
  args: {
    contentHash: v.string(),
    pdfStorageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const alreadyCached = await ctx.runQuery(
      internal.PDFParse.mineruCache.getByContentHash,
      { contentHash: args.contentHash },
    );
    if (alreadyCached !== null) {
      const waiters: MineruWaiter[] = await ctx.runMutation(
        internal.PDFParse.mineruCache.takeWaitersAndRelease,
        { contentHash: args.contentHash },
      );
      await resumeWaiters(ctx, waiters);
      return null;
    }

    const inFlight = await ctx.runQuery(
      internal.PDFParse.mineruCache.getInFlight,
      { contentHash: args.contentHash },
    );
    if (inFlight === null) {
      return null;
    }

    let taskId = inFlight.taskId;

    if (taskId === null) {
      const blob = await ctx.storage.get(args.pdfStorageId);
      if (blob === null) {
        const waiters: MineruWaiter[] = await ctx.runMutation(
          internal.PDFParse.mineruCache.takeWaitersAndRelease,
          { contentHash: args.contentHash },
        );
        await failWaiters(
          ctx,
          waiters,
          "PDF-filen hittades inte i lagringen",
        );
        return null;
      }

      try {
        taskId = await startMineruTask(blob, "document.pdf");
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "MinerU start misslyckades";
        const waiters: MineruWaiter[] = await ctx.runMutation(
          internal.PDFParse.mineruCache.takeWaitersAndRelease,
          { contentHash: args.contentHash },
        );
        await failWaiters(ctx, waiters, message);
        return null;
      }

      const deadlineAt = Date.now() + MINERU_DEADLINE_MS;
      await ctx.runMutation(internal.PDFParse.mineruCache.attachTask, {
        contentHash: args.contentHash,
        taskId,
        deadlineAt,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.PDFParse.mineruJobs.pollMineruTask,
      {
        contentHash: args.contentHash,
        taskId,
      },
    );
    return null;
  },
});

/**
 * One status check. Reschedules itself until completed, failed, or deadline.
 */
export const pollMineruTask = internalAction({
  args: {
    contentHash: v.string(),
    taskId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cached = await ctx.runQuery(
      internal.PDFParse.mineruCache.getByContentHash,
      { contentHash: args.contentHash },
    );
    if (cached !== null) {
      const waiters: MineruWaiter[] = await ctx.runMutation(
        internal.PDFParse.mineruCache.takeWaitersAndRelease,
        { contentHash: args.contentHash },
      );
      await resumeWaiters(ctx, waiters);
      return null;
    }

    const inFlight = await ctx.runQuery(
      internal.PDFParse.mineruCache.getInFlight,
      { contentHash: args.contentHash },
    );
    if (inFlight === null) {
      return null;
    }
    if (inFlight.taskId !== null && inFlight.taskId !== args.taskId) {
      // Another claim owns a different task.
      return null;
    }

    if (inFlight.deadlineAt !== null && Date.now() > inFlight.deadlineAt) {
      const waiters: MineruWaiter[] = await ctx.runMutation(
        internal.PDFParse.mineruCache.takeWaitersAndRelease,
        { contentHash: args.contentHash },
      );
      await failWaiters(ctx, waiters, "MinerU-jobb timeout");
      return null;
    }

    let detail;
    try {
      detail = await fetchMineruTaskDetail(args.taskId);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "MinerU status-poll misslyckades";
      const waiters: MineruWaiter[] = await ctx.runMutation(
        internal.PDFParse.mineruCache.takeWaitersAndRelease,
        { contentHash: args.contentHash },
      );
      await failWaiters(ctx, waiters, message);
      return null;
    }

    const status = detail.status;
    if (
      status === "failed" ||
      status === "canceled" ||
      status === "partial"
    ) {
      const waiters: MineruWaiter[] = await ctx.runMutation(
        internal.PDFParse.mineruCache.takeWaitersAndRelease,
        { contentHash: args.contentHash },
      );
      await failWaiters(
        ctx,
        waiters,
        `MinerU-jobb misslyckades: ${JSON.stringify(detail)}`,
      );
      return null;
    }

    if (status !== "completed") {
      await ctx.runMutation(internal.PDFParse.mineruCache.touchInFlight, {
        contentHash: args.contentHash,
      });
      await ctx.scheduler.runAfter(
        MINERU_POLL_INTERVAL_MS,
        internal.PDFParse.mineruJobs.pollMineruTask,
        {
          contentHash: args.contentHash,
          taskId: args.taskId,
        },
      );
      return null;
    }

    try {
      const zipBytes = await downloadMineruZipBytes(detail);
      const zip = parseMineruZip(zipBytes);

      const middleJsonStorageId = await ctx.storage.store(
        new Blob([JSON.stringify(zip.middleJson)], {
          type: "application/json",
        }),
      );
      const zipStorageId = await ctx.storage.store(
        new Blob([new Uint8Array(zipBytes)], {
          type: "application/zip",
        }),
      );

      await ctx.runMutation(internal.PDFParse.mineruCache.save, {
        contentHash: args.contentHash,
        middleJsonStorageId,
        imageAssets: [],
        zipStorageId,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Kunde inte spara MinerU-resultat";
      const waiters: MineruWaiter[] = await ctx.runMutation(
        internal.PDFParse.mineruCache.takeWaitersAndRelease,
        { contentHash: args.contentHash },
      );
      await failWaiters(ctx, waiters, message);
      return null;
    }

    const waiters: MineruWaiter[] = await ctx.runMutation(
      internal.PDFParse.mineruCache.takeWaitersAndRelease,
      { contentHash: args.contentHash },
    );
    await resumeWaiters(ctx, waiters);
    return null;
  },
});
