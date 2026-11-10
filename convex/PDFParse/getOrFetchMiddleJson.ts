import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  blobFromMineruImage,
  fetchMineruZipResult,
  normalizeMineruImagePath,
} from "./mineruClient";
import { middleJsonSchema, type MiddleJson } from "./mineruSchema";

/** Stale in-flight lock TTL — crashed winners must not block forever. */
const IN_FLIGHT_TTL_MS = 5 * 60 * 1000;
/** How long a waiter polls for cache after losing the claim. */
const WAIT_POLL_MS = 2000;
const WAIT_MAX_ATTEMPTS = 90;

export type MineruImageAsset = {
  path: string;
  storageId: Id<"_storage">;
};

export type MineruCachedParse = {
  middleJson: MiddleJson;
  imageAssets: Array<MineruImageAsset>;
};

async function loadCachedParse(
  ctx: ActionCtx,
  contentHash: string,
): Promise<MineruCachedParse | null> {
  const cached: {
    _id: Id<"mineruCache">;
    middleJsonStorageId: Id<"_storage">;
    imageAssets: Array<{ path: string; storageId: Id<"_storage"> }>;
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

  try {
    const parsed = middleJsonSchema.safeParse(
      JSON.parse(await cachedBlob.text()),
    );
    if (parsed.success) {
      return {
        middleJson: parsed.data,
        imageAssets: cached.imageAssets.map((asset) => ({
          path: normalizeMineruImagePath(asset.path),
          storageId: asset.storageId,
        })),
      };
    }
  } catch {
    // Corrupt cache entry.
  }
  return null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function claimInFlight(
  ctx: ActionCtx,
  contentHash: string,
): Promise<boolean> {
  const claim: { won: boolean } = await ctx.runMutation(
    internal.PDFParse.mineruCache.tryClaimInFlight,
    { contentHash, ttlMs: IN_FLIGHT_TTL_MS },
  );
  return claim.won;
}

/**
 * Wait until cache appears or we win the in-flight claim (stale lock / finish).
 * Returns cached data, or null if we became the fetcher.
 */
async function waitForCacheOrClaim(
  ctx: ActionCtx,
  contentHash: string,
  onStatus?: (message: string) => Promise<void>,
): Promise<MineruCachedParse | null> {
  await onStatus?.("Väntar på MinerU-tolkning…");
  for (let attempt = 0; attempt < WAIT_MAX_ATTEMPTS; attempt++) {
    await sleep(WAIT_POLL_MS);
    const waited = await loadCachedParse(ctx, contentHash);
    if (waited !== null) {
      await onStatus?.("Använder cachad MinerU-tolkning");
      return waited;
    }
    if (await claimInFlight(ctx, contentHash)) {
      return null;
    }
  }
  throw new Error("Kunde inte hämta MinerU-tolkning (timeout)");
}

async function fetchAndCacheParse(
  ctx: ActionCtx,
  pdfBytes: ArrayBuffer,
  contentHash: string,
  blobType: string,
  onStatus?: (message: string) => Promise<void>,
): Promise<MineruCachedParse> {
  try {
    await onStatus?.("Tolkar PDF med MinerU…");
    const pdfForUpload = new Blob([new Uint8Array(pdfBytes)], {
      type: blobType || "application/pdf",
    });
    const zip = await fetchMineruZipResult(pdfForUpload);

    await onStatus?.(
      zip.images.size > 0
        ? `Sparar MinerU-bilder (${zip.images.size})…`
        : "Sparar MinerU-tolkning…",
    );

    const imageAssets: Array<MineruImageAsset> = [];
    for (const [path, bytes] of zip.images.entries()) {
      const storageId = await ctx.storage.store(
        blobFromMineruImage(path, bytes),
      );
      imageAssets.push({ path, storageId });
    }

    const middleJsonStorageId = await ctx.storage.store(
      new Blob([JSON.stringify(zip.middleJson)], {
        type: "application/json",
      }),
    );
    await ctx.runMutation(internal.PDFParse.mineruCache.save, {
      contentHash,
      middleJsonStorageId,
      imageAssets,
    });
    return { middleJson: zip.middleJson, imageAssets };
  } finally {
    await ctx.runMutation(internal.PDFParse.mineruCache.releaseInFlight, {
      contentHash,
    });
  }
}

/**
 * Reuse cached MinerU middle_json (+ image assets) when present; otherwise
 * single-flight Tasks API call so concurrent problems/info jobs for the same
 * PDF do not double-call MinerU.
 */
export async function getOrFetchMiddleJson(
  ctx: ActionCtx,
  pdfBytes: ArrayBuffer,
  contentHash: string,
  blobType: string,
  onStatus?: (message: string) => Promise<void>,
): Promise<MineruCachedParse> {
  const hit = await loadCachedParse(ctx, contentHash);
  if (hit !== null) {
    await onStatus?.("Använder cachad MinerU-tolkning");
    return hit;
  }

  if (!(await claimInFlight(ctx, contentHash))) {
    const waited = await waitForCacheOrClaim(ctx, contentHash, onStatus);
    if (waited !== null) {
      return waited;
    }
  }

  return await fetchAndCacheParse(
    ctx,
    pdfBytes,
    contentHash,
    blobType,
    onStatus,
  );
}
