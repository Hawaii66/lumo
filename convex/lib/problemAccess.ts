import type { Doc, Id } from "../_generated/dataModel";

export function isShadowProblem(row: Doc<"problems">): boolean {
  return row.parentProblemId !== undefined && row.roomId !== undefined;
}

/**
 * Visible in a room if: shadow owned by the room (and parent PDF not archived),
 * or parsed with a matching room file contentHash that is not archived.
 */
export function problemVisibleInRoom(
  row: Doc<"problems">,
  roomId: Id<"rooms">,
  roomFiles: Array<Doc<"files">>,
  archivedContentHashes: ReadonlySet<string> = new Set(),
  /** Parent's contentHash when checking a shadow (archive follows parent PDF). */
  parentContentHash?: string,
): boolean {
  if (isShadowProblem(row)) {
    if (row.roomId !== roomId) {
      return false;
    }
    if (
      parentContentHash !== undefined &&
      archivedContentHashes.has(parentContentHash)
    ) {
      return false;
    }
    return true;
  }
  if (row.contentHash === undefined) {
    return false;
  }
  if (archivedContentHashes.has(row.contentHash)) {
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
