import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  MINERU_CLAIM_STALE_MS,
  MINERU_POLL_INTERVAL_MS,
  normalizeMineruImagePath,
  parseMineruZip,
} from "./mineruClient";
import type { MineruWaiter } from "./mineruCache";
import { middleJsonSchema, type MiddleJson } from "./mineruSchema";

export type MineruImageAsset = {
  path: string;
  storageId: Id<"_storage">;
};

export type MineruCachedParse = {
  middleJson: MiddleJson;
  /**
   * Raw ZIP image bytes when a temporary zipStorageId is still present,
   * or from a fresh unpack. Empty when only uploaded imageAssets remain.
   */
  imageBytes: Map<string, Uint8Array>;
  /**
   * Previously uploaded figure assets referenced by problems.
   * Never includes unused equation crops.
   */
  imageAssets: Array<MineruImageAsset>;
};

export type EnsureMiddleJsonResult =
  | { status: "ready"; parse: MineruCachedParse }
  | { status: "pending" };

async function loadCachedParse(
  ctx: ActionCtx,
  contentHash: string,
): Promise<MineruCachedParse | null> {
  const cached: {
    _id: Id<"mineruCache">;
    middleJsonStorageId: Id<"_storage">;
    imageAssets: Array<{ path: string; storageId: Id<"_storage"> }>;
    zipStorageId: Id<"_storage"> | null;
  } | null = await ctx.runQuery(
    internal.PDFParse.mineruCache.getByContentHash,
    { contentHash },
  );

  if (cached === null) {
    return null;
  }

  const cachedBlob = await ctx.storage.get(cached.middleJsonStorageId);
  if (cachedBlob === null) {
    return null;
  }

  let middleJson: MiddleJson;
  try {
    const parsed = middleJsonSchema.safeParse(
      JSON.parse(await cachedBlob.text()),
    );
    if (!parsed.success) {
      return null;
    }
    middleJson = parsed.data;
  } catch {
    return null;
  }

  const imageBytes = new Map<string, Uint8Array>();
  if (cached.zipStorageId !== null) {
    const zipBlob = await ctx.storage.get(cached.zipStorageId);
    if (zipBlob !== null) {
      try {
        const zip = parseMineruZip(await zipBlob.arrayBuffer());
        for (const [path, bytes] of zip.images.entries()) {
          imageBytes.set(normalizeMineruImagePath(path), bytes);
        }
      } catch {
        // Corrupt zip — fall through with empty imageBytes.
      }
    }
  }

  return {
    middleJson,
    imageBytes,
    imageAssets: cached.imageAssets.map((asset) => ({
      path: normalizeMineruImagePath(asset.path),
      storageId: asset.storageId,
    })),
  };
}

/**
 * Return cached MinerU parse when present; otherwise register `waiter`,
 * start a scheduled MinerU fetch if needed, and return pending.
 *
 * Callers must exit the current action on pending — completion resumes
 * waiters via `mineruJobs.pollMineruTask`.
 */
export async function ensureMiddleJson(
  ctx: ActionCtx,
  contentHash: string,
  pdfStorageId: Id<"_storage">,
  waiter: MineruWaiter | undefined,
  onStatus?: (message: string) => Promise<void>,
): Promise<EnsureMiddleJsonResult> {
  const hit = await loadCachedParse(ctx, contentHash);
  if (hit !== null) {
    await onStatus?.("Använder cachad MinerU-tolkning");
    return { status: "ready", parse: hit };
  }

  await onStatus?.("Tolkar PDF med MinerU…");

  const claim: {
    won: boolean;
    taskId: string | null;
    deadlineAt: number | null;
  } = await ctx.runMutation(internal.PDFParse.mineruCache.tryClaimInFlight, {
    contentHash,
    pdfStorageId,
    staleMs: MINERU_CLAIM_STALE_MS,
  });

  // Cache may have landed between the first check and the claim.
  const ready = await loadCachedParse(ctx, contentHash);
  if (ready !== null) {
    if (claim.won) {
      // Resume any prior waiters still on the row; we continue inline.
      await ctx.scheduler.runAfter(
        0,
        internal.PDFParse.mineruJobs.startMineruFetch,
        { contentHash, pdfStorageId },
      );
    }
    await onStatus?.("Använder cachad MinerU-tolkning");
    return { status: "ready", parse: ready };
  }

  // Only register waiters when we will exit and need a resume.
  if (waiter !== undefined) {
    await ctx.runMutation(internal.PDFParse.mineruCache.addWaiter, {
      contentHash,
      waiter,
    });
  }

  if (claim.won) {
    await ctx.scheduler.runAfter(
      0,
      internal.PDFParse.mineruJobs.startMineruFetch,
      {
        contentHash,
        pdfStorageId,
      },
    );
  } else if (claim.taskId !== null) {
    await ctx.scheduler.runAfter(
      MINERU_POLL_INTERVAL_MS,
      internal.PDFParse.mineruJobs.pollMineruTask,
      {
        contentHash,
        taskId: claim.taskId,
      },
    );
  }

  return { status: "pending" };
}

/**
 * Load cached MinerU parse or throw. Does not start a fetch.
 */
export async function requireCachedMiddleJson(
  ctx: ActionCtx,
  contentHash: string,
): Promise<MineruCachedParse> {
  const hit = await loadCachedParse(ctx, contentHash);
  if (hit === null) {
    throw new Error("Ingen MinerU-cache för denna PDF — kör från MinerU först");
  }
  return hit;
}
