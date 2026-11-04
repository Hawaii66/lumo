import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DEFAULT_FREE_DAILY_CREDITS } from "./credits";

export const ROLE_KEYS = ["default", "promoter", "admin"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const DEFAULT_ROLE_CREDITS: Record<RoleKey, number> = {
  default: DEFAULT_FREE_DAILY_CREDITS,
  promoter: 100,
  admin: DEFAULT_FREE_DAILY_CREDITS,
};

export type RoleSummary = {
  key: RoleKey;
  freeDailyCredits: number;
};

type DbCtx = QueryCtx | MutationCtx;

export async function getRoleByKey(
  ctx: DbCtx,
  key: RoleKey,
): Promise<Doc<"roles"> | null> {
  return await ctx.db
    .query("roles")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

/** Insert any missing role catalog rows (idempotent). Mutation-only. */
export async function ensureRoles(ctx: MutationCtx): Promise<void> {
  const now = Date.now();
  for (const key of ROLE_KEYS) {
    const existing = await getRoleByKey(ctx, key);
    if (existing !== null) {
      continue;
    }
    await ctx.db.insert("roles", {
      key,
      freeDailyCredits: DEFAULT_ROLE_CREDITS[key],
      updatedAt: now,
    });
  }
}

/**
 * Resolve the user's role. Missing `roleId` or missing role row → default.
 * If the catalog is empty (queries can't write), returns a synthetic default.
 */
export async function getUserRole(
  ctx: DbCtx,
  userId: Id<"users">,
): Promise<RoleSummary & { _id?: Id<"roles"> }> {
  const user = await ctx.db.get(userId);
  if (user !== null && user.roleId !== undefined) {
    const assigned = await ctx.db.get(user.roleId);
    if (assigned !== null) {
      return {
        _id: assigned._id,
        key: assigned.key,
        freeDailyCredits: assigned.freeDailyCredits,
      };
    }
  }

  const defaultRole = await getRoleByKey(ctx, "default");
  if (defaultRole !== null) {
    return {
      _id: defaultRole._id,
      key: defaultRole.key,
      freeDailyCredits: defaultRole.freeDailyCredits,
    };
  }

  return {
    key: "default",
    freeDailyCredits: DEFAULT_ROLE_CREDITS.default,
  };
}

/** Ensure catalog exists, then resolve role (for grant/spend mutations). */
export async function getUserRoleEnsured(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"roles">> {
  await ensureRoles(ctx);
  const summary = await getUserRole(ctx, userId);
  if (summary._id === undefined) {
    throw new Error("Kunde inte skapa default-roll");
  }
  const doc = await ctx.db.get(summary._id);
  if (doc === null) {
    throw new Error("Kunde inte läsa roll");
  }
  return doc;
}

export async function requireAdmin(ctx: DbCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Du måste vara inloggad");
  }

  const role = await getUserRole(ctx, userId);
  if (role.key !== "admin") {
    throw new Error("Endast admin");
  }
  return userId;
}
