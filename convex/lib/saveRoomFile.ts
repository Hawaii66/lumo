import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  isAllowedRoomFile,
  MAX_FILE_NAME_LENGTH,
  MAX_FILES_PER_ROOM,
  ROOM_FILE_TYPE_ERROR,
} from "./roomFiles";

export async function saveRoomFile(
  ctx: MutationCtx,
  args: {
    roomId: Id<"rooms">;
    name: string;
    storageId: Id<"_storage">;
  },
): Promise<Id<"files">> {
  const name = args.name.trim();
  if (name.length === 0) {
    throw new Error("Filnamnet får inte vara tomt");
  }
  if (name.length > MAX_FILE_NAME_LENGTH) {
    throw new Error(
      `Filnamnet får vara högst ${MAX_FILE_NAME_LENGTH} tecken`,
    );
  }

  const metadata = await ctx.db.system.get("_storage", args.storageId);
  if (metadata === null) {
    throw new Error("Filen hittades inte i lagringen");
  }

  if (!isAllowedRoomFile(name, metadata.contentType)) {
    await ctx.storage.delete(args.storageId);
    throw new Error(ROOM_FILE_TYPE_ERROR);
  }

  const existingFiles = await ctx.db
    .query("files")
    .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
    .take(MAX_FILES_PER_ROOM);

  if (existingFiles.length >= MAX_FILES_PER_ROOM) {
    await ctx.storage.delete(args.storageId);
    throw new Error("Rummet har för många filer");
  }

  return await ctx.db.insert("files", {
    roomId: args.roomId,
    name,
    storageId: args.storageId,
    contentHash: metadata.sha256,
  });
}
