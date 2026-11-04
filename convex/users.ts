import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getUserRole } from "./lib/roles";

const MAX_NAME_LENGTH = 80;

const roleSummaryValidator = v.object({
  key: v.union(
    v.literal("default"),
    v.literal("promoter"),
    v.literal("admin"),
  ),
  freeDailyCredits: v.number(),
});

const viewerFieldsValidator = v.object({
  _id: v.id("users"),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  image: v.union(v.string(), v.null()),
  providers: v.array(
    v.object({
      provider: v.string(),
      providerId: v.string(),
    }),
  ),
  role: roleSummaryValidator,
});

export const viewer = query({
  args: {},
  returns: v.union(v.null(), viewerFieldsValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const user = await ctx.db.get(userId);
    if (user === null) {
      return null;
    }

    const identity = await ctx.auth.getUserIdentity();

    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .take(10);

    const roleDoc = await getUserRole(ctx, userId);

    return {
      _id: user._id,
      name: user.name ?? identity?.name ?? null,
      email: user.email ?? identity?.email ?? null,
      image: user.image ?? identity?.pictureUrl ?? null,
      providers: accounts.map((account) => ({
        provider: account.provider,
        providerId: account.providerAccountId,
      })),
      role: {
        key: roleDoc.key,
        freeDailyCredits: roleDoc.freeDailyCredits,
      },
    };
  },
});

export const updateName = mutation({
  args: { name: v.string() },
  returns: v.object({
    _id: v.id("users"),
    name: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Namnet får inte vara tomt");
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new Error(`Namnet får vara högst ${MAX_NAME_LENGTH} tecken`);
    }

    const user = await ctx.db.get(userId);
    if (user === null) {
      throw new Error("Användaren hittades inte");
    }

    await ctx.db.patch(userId, { name });

    return { _id: userId, name };
  },
});
