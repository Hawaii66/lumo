import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireRoomMember } from "./lib/roomAuth";
import {
  assertValidPageRanges,
  formatPageRanges,
  inputKeyFromExtract,
  type PageRange,
} from "./lib/pdfExtract";
import {
  fileExtension,
  isAllowedRoomFileName,
  MAX_FILE_NAME_LENGTH,
  MAX_FILES_PER_ROOM,
} from "./lib/roomFiles";
import { saveRoomFile } from "./lib/saveRoomFile";

const pageRangeValidator = v.object({
  start: v.number(),
  end: v.number(),
});

const extractSummaryValidator = v.object({
  _id: v.id("pdfExtracts"),
  sourceContentHash: v.string(),
  pageRanges: v.array(pageRangeValidator),
  extractedContentHash: v.string(),
  url: v.union(v.string(), v.null()),
});

const suggestionValidator = v.object({
  _id: v.id("pdfExtracts"),
  sourceContentHash: v.string(),
  sourceName: v.string(),
  pageRanges: v.array(pageRangeValidator),
  rangesLabel: v.string(),
  extractedContentHash: v.string(),
  url: v.union(v.string(), v.null()),
});

export const findBySourceAndRanges = query({
  args: {
    sourceContentHash: v.string(),
    pageRanges: v.array(pageRangeValidator),
  },
  returns: v.union(extractSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    try {
      assertValidPageRanges(args.pageRanges);
    } catch {
      return null;
    }
    if (args.sourceContentHash.length === 0) {
      return null;
    }

    const inputKey = inputKeyFromExtract(
      args.sourceContentHash,
      args.pageRanges,
    );
    const row = await ctx.db
      .query("pdfExtracts")
      .withIndex("by_inputKey", (q) => q.eq("inputKey", inputKey))
      .unique();
    if (row === null) {
      return null;
    }

    const url = await ctx.storage.getUrl(row.extractedStorageId);
    return {
      _id: row._id,
      sourceContentHash: row.sourceContentHash,
      pageRanges: row.pageRanges,
      extractedContentHash: row.extractedContentHash,
      url,
    };
  },
});

export const listSuggestionsForRoom = query({
  args: { roomId: v.id("rooms") },
  returns: v.array(suggestionValidator),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }
    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", userId).eq("roomId", args.roomId),
      )
      .unique();
    if (membership === null) {
      return [];
    }

    const files = await ctx.db
      .query("files")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .take(MAX_FILES_PER_ROOM);

    const hashToNames = new Map<string, string[]>();
    const roomHashes = new Set<string>();
    for (const file of files) {
      roomHashes.add(file.contentHash);
      const names = hashToNames.get(file.contentHash);
      if (names === undefined) {
        hashToNames.set(file.contentHash, [file.name]);
      } else {
        names.push(file.name);
      }
    }

    if (roomHashes.size === 0) {
      return [];
    }

    const suggestions = [];
    const seenExtractIds = new Set<string>();

    for (const sourceHash of roomHashes) {
      const extracts = await ctx.db
        .query("pdfExtracts")
        .withIndex("by_sourceContentHash", (q) =>
          q.eq("sourceContentHash", sourceHash),
        )
        .take(100);

      for (const extract of extracts) {
        if (seenExtractIds.has(extract._id)) {
          continue;
        }
        if (roomHashes.has(extract.extractedContentHash)) {
          continue;
        }
        seenExtractIds.add(extract._id);

        const names = hashToNames.get(sourceHash);
        const sourceName = names?.[0] ?? sourceHash.slice(0, 8);
        const url = await ctx.storage.getUrl(extract.extractedStorageId);
        suggestions.push({
          _id: extract._id,
          sourceContentHash: extract.sourceContentHash,
          sourceName,
          pageRanges: extract.pageRanges,
          rangesLabel: formatPageRanges(extract.pageRanges),
          extractedContentHash: extract.extractedContentHash,
          url,
        });
      }
    }

    return suggestions;
  },
});

export const register = mutation({
  args: {
    sourceContentHash: v.string(),
    pageRanges: v.array(pageRangeValidator),
    extractedStorageId: v.id("_storage"),
  },
  returns: v.id("pdfExtracts"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (args.sourceContentHash.length === 0) {
      throw new Error("Ogiltig källfilhash");
    }
    assertValidPageRanges(args.pageRanges);

    const metadata = await ctx.db.system.get(
      "_storage",
      args.extractedStorageId,
    );
    if (metadata === null) {
      throw new Error("Den extraherade filen hittades inte i lagringen");
    }
    const contentType = (metadata.contentType ?? "").toLowerCase();
    if (
      contentType !== "application/pdf" &&
      contentType !== "application/octet-stream" &&
      contentType !== ""
    ) {
      throw new Error("Den extraherade filen måste vara en PDF");
    }
    const extractedContentHash = metadata.sha256;
    const inputKey = inputKeyFromExtract(
      args.sourceContentHash,
      args.pageRanges,
    );

    const existing = await ctx.db
      .query("pdfExtracts")
      .withIndex("by_inputKey", (q) => q.eq("inputKey", inputKey))
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        extractedStorageId: args.extractedStorageId,
        extractedContentHash,
      });
      return existing._id;
    }

    return await ctx.db.insert("pdfExtracts", {
      inputKey,
      sourceContentHash: args.sourceContentHash,
      pageRanges: args.pageRanges as PageRange[],
      extractedContentHash,
      extractedStorageId: args.extractedStorageId,
      ...(userId !== null ? { createdBy: userId } : {}),
    });
  },
});

export const getInternal = internalQuery({
  args: { extractId: v.id("pdfExtracts") },
  returns: v.union(
    v.object({
      _id: v.id("pdfExtracts"),
      extractedContentHash: v.string(),
      extractedStorageId: v.id("_storage"),
      pageRanges: v.array(pageRangeValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const extract = await ctx.db.get(args.extractId);
    if (extract === null) {
      return null;
    }
    return {
      _id: extract._id,
      extractedContentHash: extract.extractedContentHash,
      extractedStorageId: extract.extractedStorageId,
      pageRanges: extract.pageRanges,
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

export const saveAttachedInternal = internalMutation({
  args: {
    roomId: v.id("rooms"),
    name: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.id("files"),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    return await saveRoomFile(ctx, args);
  },
});

/**
 * Copy the registered extract blob into the room as a new files row.
 * Uses an action because storage.get/store are not available in mutations.
 */
export const attachToRoom = action({
  args: {
    roomId: v.id("rooms"),
    extractId: v.id("pdfExtracts"),
    name: v.string(),
  },
  returns: v.id("files"),
  handler: async (ctx, args): Promise<Id<"files">> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Filnamnet får inte vara tomt");
    }
    if (name.length > MAX_FILE_NAME_LENGTH) {
      throw new Error(
        `Filnamnet får vara högst ${MAX_FILE_NAME_LENGTH} tecken`,
      );
    }
    if (!isAllowedRoomFileName(name) || fileExtension(name) !== ".pdf") {
      throw new Error("Den extraherade filen måste vara en PDF");
    }

    const extract: {
      _id: Id<"pdfExtracts">;
      extractedContentHash: string;
      extractedStorageId: Id<"_storage">;
      pageRanges: PageRange[];
    } | null = await ctx.runQuery(internal.pdfExtracts.getInternal, {
      extractId: args.extractId,
    });
    if (extract === null) {
      throw new Error("Sidutdraget hittades inte");
    }

    const existingId: Id<"files"> | null = await ctx.runQuery(
      internal.pdfExtracts.findFileByContentHashInternal,
      {
        roomId: args.roomId,
        contentHash: extract.extractedContentHash,
      },
    );
    if (existingId !== null) {
      return existingId;
    }

    const blob = await ctx.storage.get(extract.extractedStorageId);
    if (blob === null) {
      throw new Error(
        "Den extraherade filen saknas i lagringen. Extrahera sidorna igen.",
      );
    }

    const newStorageId = await ctx.storage.store(blob);
    return await ctx.runMutation(internal.pdfExtracts.saveAttachedInternal, {
      roomId: args.roomId,
      name,
      storageId: newStorageId,
    });
  },
});
