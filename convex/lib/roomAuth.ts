import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function requireRoomMember(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Du måste vara inloggad");
  }

  const membership = await ctx.db
    .query("roomMembers")
    .withIndex("by_user_and_room", (q) =>
      q.eq("userId", userId).eq("roomId", roomId),
    )
    .unique();

  if (membership === null) {
    throw new Error("Du saknar åtkomst till rummet");
  }

  return userId;
}

export function isTemplateRoom(room: Doc<"rooms">): boolean {
  return room.isTemplateRoom === true;
}

/** Chat and other student-only writes must not run on template workspaces. */
export async function assertNotTemplateRoom(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
): Promise<void> {
  const room = await ctx.db.get("rooms", roomId);
  if (room === null) {
    throw new Error("Rummet hittades inte");
  }
  if (isTemplateRoom(room)) {
    throw new Error("Mallrum stöder inte chatt");
  }
}

export async function assertTemplateRoom(
  ctx: QueryCtx | MutationCtx,
  roomId: Id<"rooms">,
): Promise<Doc<"rooms">> {
  const room = await ctx.db.get("rooms", roomId);
  if (room === null) {
    throw new Error("Rummet hittades inte");
  }
  if (!isTemplateRoom(room)) {
    throw new Error("Endast mallrum kan publiceras som mall");
  }
  return room;
}
