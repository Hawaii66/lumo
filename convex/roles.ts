import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertNonNegInt } from "./lib/credits";
import {
  DEFAULT_ROLE_CREDITS,
  ROLE_KEYS,
  ensureRoles,
  getRoleByKey,
  getUserRole,
  requireAdmin,
} from "./lib/roles";

const roleKeyValidator = v.union(
  v.literal("default"),
  v.literal("promoter"),
  v.literal("admin"),
);

const roleValidator = v.object({
  key: roleKeyValidator,
  freeDailyCredits: v.number(),
});

export const listRoles = query({
  args: {},
  returns: v.array(roleValidator),
  handler: async (ctx) => {
    const roles = [];
    for (const key of ROLE_KEYS) {
      const role = await getRoleByKey(ctx, key);
      roles.push({
        key,
        freeDailyCredits:
          role?.freeDailyCredits ?? DEFAULT_ROLE_CREDITS[key],
      });
    }
    return roles;
  },
});

export const updateRoleCredits = mutation({
  args: {
    key: roleKeyValidator,
    freeDailyCredits: v.number(),
  },
  returns: roleValidator,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    assertNonNegInt("freeDailyCredits", args.freeDailyCredits);
    await ensureRoles(ctx);

    const role = await getRoleByKey(ctx, args.key);
    if (role === null) {
      throw new Error("Kunde inte hitta roll");
    }

    await ctx.db.patch(role._id, {
      freeDailyCredits: args.freeDailyCredits,
      updatedAt: Date.now(),
    });
    const updated = await ctx.db.get(role._id);
    if (updated === null) {
      throw new Error("Kunde inte uppdatera role");
    }
    return {
      key: updated.key,
      freeDailyCredits: updated.freeDailyCredits,
    };
  },
});

export const setUserRole = mutation({
  args: {
    userId: v.id("users"),
    key: roleKeyValidator,
  },
  returns: roleValidator,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ensureRoles(ctx);

    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error("Användare finns inte");
    }

    const role = await getRoleByKey(ctx, args.key);
    if (role === null) {
      throw new Error("Kunde inte hitta roll");
    }

    await ctx.db.patch(args.userId, { roleId: role._id });
    return {
      key: role.key,
      freeDailyCredits: role.freeDailyCredits,
    };
  },
});

/** Admin: look up a user by email so roles can be assigned from the profile UI. */
export const findUserByEmail = query({
  args: { email: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("users"),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      roleKey: roleKeyValidator,
    }),
  ),
  handler: async (ctx, args) => {
    // Soft-auth: non-admins just see null (avoids noisy query errors).
    try {
      await requireAdmin(ctx);
    } catch {
      return null;
    }

    const trimmed = args.email.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const lower = trimmed.toLowerCase();
    let user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", lower))
      .unique();
    if (user === null && lower !== trimmed) {
      user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", trimmed))
        .unique();
    }
    if (user === null) {
      return null;
    }

    const role = await getUserRole(ctx, user._id);
    return {
      _id: user._id,
      name: user.name ?? null,
      email: user.email ?? null,
      roleKey: role.key,
    };
  },
});
