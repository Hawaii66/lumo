import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

export const viewer = query({
  args: {},
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

    return {
      _id: user._id,
      name: user.name ?? identity?.name ?? null,
      email: user.email ?? identity?.email ?? null,
      image: user.image ?? identity?.pictureUrl ?? null,
      providers: accounts.map((account) => ({
        provider: account.provider,
        providerId: account.providerAccountId,
      })),
    };
  },
});
