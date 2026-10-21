import type { Doc, Id } from "../_generated/dataModel";

export function isShadowProblem(row: Doc<"problems">): boolean {
  return row.parentProblemId !== undefined && row.roomId !== undefined;
}

/**
 * Visible in a room if: shadow owned by the room, or parsed with a matching
 * room file contentHash.
 */
export function problemVisibleInRoom(
  row: Doc<"problems">,
  roomId: Id<"rooms">,
  roomFiles: Array<Doc<"files">>,
): boolean {
  if (isShadowProblem(row)) {
    return row.roomId === roomId;
  }
  if (row.contentHash === undefined) {
    return false;
  }
  return roomFiles.some((f) => f.contentHash === row.contentHash);
}

export function fileForParsedProblem(
  row: Doc<"problems">,
  roomFiles: Array<Doc<"files">>,
): Doc<"files"> | undefined {
  if (row.contentHash === undefined) {
    return undefined;
  }
  return roomFiles.find((f) => f.contentHash === row.contentHash);
}
