import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  crawlCoursePdfs,
  fetchCourseResource,
  looksLikePdf,
  safePdfFileName,
} from "./lib/courseSiteScrape";
import { parseMaiCourseRoot } from "./lib/maiCourseUrl";
import {
  assertTemplateRoom,
  requireRoomMember,
} from "./lib/roomAuth";
import { MAX_FILES_PER_ROOM } from "./lib/roomFiles";
import { saveRoomFile } from "./lib/saveRoomFile";

const MAX_PDFS_PER_IMPORT = 60;
const MAX_BYTES_PER_PDF = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 80 * 1024 * 1024;
const DOWNLOAD_DELAY_MS = 150;

const failedItemValidator = v.object({
  name: v.string(),
  reason: v.string(),
});

const importResultValidator = v.object({
  imported: v.number(),
  skipped: v.number(),
  failed: v.array(failedItemValidator),
  pdfCount: v.number(),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const assertCanImport = internalQuery({
  args: { roomId: v.id("rooms") },
  returns: v.object({
    ok: v.literal(true),
    existingNames: v.array(v.string()),
    fileCount: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    await assertTemplateRoom(ctx, args.roomId);
    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    return {
      ok: true as const,
      existingNames: files.map((f) => f.name),
      fileCount: files.length,
    };
  },
});

export const findFileByContentHashInternal = internalQuery({
  args: {
    roomId: v.id("rooms"),
    contentHash: v.string(),
  },
  returns: v.union(v.id("files"), v.null()),
  handler: async (ctx, args) => {
    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    const match = files.find((f) => f.contentHash === args.contentHash);
    return match?._id ?? null;
  },
});

export const saveImportedFile = internalMutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.union(
    v.object({ status: v.literal("imported"), fileId: v.id("files") }),
    v.object({ status: v.literal("skipped") }),
  ),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    await assertTemplateRoom(ctx, args.roomId);

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) {
      throw new Error("Filen hittades inte i lagringen");
    }

    const existing = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);
    if (existing.some((f) => f.contentHash === metadata.sha256)) {
      await ctx.storage.delete(args.storageId);
      return { status: "skipped" as const };
    }

    const fileId = await saveRoomFile(ctx, args);
    return { status: "imported" as const, fileId };
  },
});

/**
 * Scrape a MAI course root (+ depth-1 same-course pages) for PDFs and attach
 * them to a template room.
 */
export const importFromCourseSite = action({
  args: {
    roomId: v.id("rooms"),
    url: v.string(),
  },
  returns: importResultValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const root = parseMaiCourseRoot(args.url);

    const access: {
      ok: true;
      existingNames: string[];
      fileCount: number;
    } = await ctx.runQuery(internal.courseSiteImport.assertCanImport, {
      roomId: args.roomId,
    });

    const roomCapacity = MAX_FILES_PER_ROOM - access.fileCount;
    if (roomCapacity <= 0) {
      throw new Error("Rummet har för många filer");
    }

    const pdfUrls = await crawlCoursePdfs(root, {
      maxPdfs: Math.min(MAX_PDFS_PER_IMPORT, roomCapacity),
      delayMs: DOWNLOAD_DELAY_MS,
    });

    const failed: Array<{ name: string; reason: string }> = [];
    let imported = 0;
    let skipped = 0;
    let totalBytes = 0;
    const usedNames = new Set(access.existingNames);

    for (const pdfUrl of pdfUrls) {
      const name = safePdfFileName(pdfUrl, usedNames);
      try {
        if (totalBytes >= MAX_TOTAL_BYTES) {
          failed.push({
            name,
            reason: "Importgräns för total storlek uppnådd",
          });
          continue;
        }

        const resource = await fetchCourseResource(pdfUrl, root.coursePrefix);
        if (!looksLikePdf(resource.body, resource.contentType)) {
          failed.push({ name, reason: "Inte en giltig PDF" });
          await sleep(DOWNLOAD_DELAY_MS);
          continue;
        }
        if (resource.body.byteLength > MAX_BYTES_PER_PDF) {
          failed.push({
            name,
            reason: `Filen är större än ${MAX_BYTES_PER_PDF / (1024 * 1024)} MB`,
          });
          await sleep(DOWNLOAD_DELAY_MS);
          continue;
        }
        if (totalBytes + resource.body.byteLength > MAX_TOTAL_BYTES) {
          failed.push({
            name,
            reason: "Importgräns för total storlek uppnådd",
          });
          await sleep(DOWNLOAD_DELAY_MS);
          continue;
        }

        // Copy into a plain ArrayBuffer — Blob rejects SharedArrayBuffer views.
        const copy = new Uint8Array(resource.body.byteLength);
        copy.set(resource.body);
        const blob = new Blob([copy], { type: "application/pdf" });
        const storageId = await ctx.storage.store(blob);

        const result: {
          status: "imported" | "skipped";
          fileId?: Id<"files">;
        } = await ctx.runMutation(internal.courseSiteImport.saveImportedFile, {
          roomId: args.roomId,
          name,
          storageId,
        });

        if (result.status === "skipped") {
          skipped += 1;
        } else {
          imported += 1;
          totalBytes += resource.body.byteLength;
        }
      } catch (err: unknown) {
        failed.push({
          name,
          reason: err instanceof Error ? err.message : "Kunde inte hämta",
        });
      }
      await sleep(DOWNLOAD_DELAY_MS);
    }

    return {
      imported,
      skipped,
      failed,
      pdfCount: pdfUrls.length,
    };
  },
});
