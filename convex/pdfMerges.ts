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
  fileExtension,
  isAllowedRoomFileName,
  MAX_FILE_NAME_LENGTH,
  MAX_FILES_PER_ROOM,
} from "./lib/roomFiles";
import {
  inputKeyFromHashes,
  MAX_MERGE_INPUTS,
  MIN_MERGE_INPUTS,
} from "./lib/pdfMerge";
import { saveRoomFile } from "./lib/saveRoomFile";

/** Upper bound when scanning the global merge registry for room suggestions. */
const MAX_MERGES_SCAN = 500;

function validateInputHashes(hashes: string[]): void {
  if (hashes.length < MIN_MERGE_INPUTS) {
    throw new Error(`Välj minst ${MIN_MERGE_INPUTS} PDF:er`);
  }
  if (hashes.length > MAX_MERGE_INPUTS) {
    throw new Error(`Högst ${MAX_MERGE_INPUTS} PDF:er kan slås ihop`);
  }
  for (const hash of hashes) {
    if (hash.length === 0) {
      throw new Error("Ogiltig filhash");
    }
  }
}

const mergeSummaryValidator = v.object({
  _id: v.id("pdfMerges"),
  inputHashes: v.array(v.string()),
  mergedContentHash: v.string(),
  url: v.union(v.string(), v.null()),
});

const suggestionValidator = v.object({
  _id: v.id("pdfMerges"),
  inputHashes: v.array(v.string()),
  inputNames: v.array(v.string()),
  mergedContentHash: v.string(),
  url: v.union(v.string(), v.null()),
});

export const findByInputHashes = query({
  args: {
    roomId: v.id("rooms"),
    inputHashes: v.array(v.string()),
  },
  returns: v.union(mergeSummaryValidator, v.null()),
  handler: async (ctx, args) => {
    await requireRoomMember(ctx, args.roomId);
    if (
      args.inputHashes.length < MIN_MERGE_INPUTS ||
      args.inputHashes.length > MAX_MERGE_INPUTS
    ) {
      return null;
    }

    const inputKey = inputKeyFromHashes(args.inputHashes);
    const row = await ctx.db
      .query("pdfMerges")
      .withIndex("by_inputKey", (q) => q.eq("inputKey", inputKey))
      .unique();
    if (row === null) {
      return null;
    }

    const url = await ctx.storage.getUrl(row.mergedStorageId);
    return {
      _id: row._id,
      inputHashes: row.inputHashes,
      mergedContentHash: row.mergedContentHash,
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

    if (roomHashes.size < MIN_MERGE_INPUTS) {
      return [];
    }

    const merges = await ctx.db.query("pdfMerges").take(MAX_MERGES_SCAN);
    const suggestions = [];

    for (const merge of merges) {
      if (roomHashes.has(merge.mergedContentHash)) {
        continue;
      }
      if (
        merge.inputHashes.length < MIN_MERGE_INPUTS ||
        !merge.inputHashes.every((h) => roomHashes.has(h))
      ) {
        continue;
      }

      const inputNames = merge.inputHashes.map((hash) => {
        const names = hashToNames.get(hash);
        return names?.[0] ?? hash.slice(0, 8);
      });

      const url = await ctx.storage.getUrl(merge.mergedStorageId);
      suggestions.push({
        _id: merge._id,
        inputHashes: merge.inputHashes,
        inputNames,
        mergedContentHash: merge.mergedContentHash,
        url,
      });
    }

    return suggestions;
  },
});

export const register = mutation({
  args: {
    roomId: v.id("rooms"),
    inputHashes: v.array(v.string()),
    mergedStorageId: v.id("_storage"),
  },
  returns: v.id("pdfMerges"),
  handler: async (ctx, args) => {
    const userId = await requireRoomMember(ctx, args.roomId);
    validateInputHashes(args.inputHashes);

    const metadata = await ctx.db.system.get("_storage", args.mergedStorageId);
    if (metadata === null) {
      throw new Error("Den sammanslagna filen hittades inte i lagringen");
    }
    const mergedContentHash = metadata.sha256;
    const inputKey = inputKeyFromHashes(args.inputHashes);

    const existing = await ctx.db
      .query("pdfMerges")
      .withIndex("by_inputKey", (q) => q.eq("inputKey", inputKey))
      .unique();

    if (existing !== null) {
      // Refresh blob pointer (covers dead storage after "Slå ihop igen").
      await ctx.db.patch(existing._id, {
        mergedStorageId: args.mergedStorageId,
        mergedContentHash,
      });
      return existing._id;
    }

    return await ctx.db.insert("pdfMerges", {
      inputKey,
      inputHashes: args.inputHashes,
      mergedContentHash,
      mergedStorageId: args.mergedStorageId,
      createdBy: userId,
    });
  },
});

export const getInternal = internalQuery({
  args: { mergeId: v.id("pdfMerges") },
  returns: v.union(
    v.object({
      _id: v.id("pdfMerges"),
      mergedContentHash: v.string(),
      mergedStorageId: v.id("_storage"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const merge = await ctx.db.get(args.mergeId);
    if (merge === null) {
      return null;
    }
    return {
      _id: merge._id,
      mergedContentHash: merge.mergedContentHash,
      mergedStorageId: merge.mergedStorageId,
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
 * Copy the registered merge blob into the room as a new files row.
 * Uses an action because storage.get/store are not available in mutations.
 */
export const attachToRoom = action({
  args: {
    roomId: v.id("rooms"),
    mergeId: v.id("pdfMerges"),
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
      throw new Error("Den sammanslagna filen måste vara en PDF");
    }

    const merge: {
      _id: Id<"pdfMerges">;
      mergedContentHash: string;
      mergedStorageId: Id<"_storage">;
    } | null = await ctx.runQuery(internal.pdfMerges.getInternal, {
      mergeId: args.mergeId,
    });
    if (merge === null) {
      throw new Error("Sammanslagningen hittades inte");
    }

    const existingId: Id<"files"> | null = await ctx.runQuery(
      internal.pdfMerges.findFileByContentHashInternal,
      {
        roomId: args.roomId,
        contentHash: merge.mergedContentHash,
      },
    );
    if (existingId !== null) {
      return existingId;
    }

    const blob = await ctx.storage.get(merge.mergedStorageId);
    if (blob === null) {
      throw new Error(
        "Den sammanslagna filen saknas i lagringen. Slå ihop PDF:erna igen.",
      );
    }

    const newStorageId = await ctx.storage.store(blob);
    return await ctx.runMutation(internal.pdfMerges.saveAttachedInternal, {
      roomId: args.roomId,
      name,
      storageId: newStorageId,
    });
  },
});
