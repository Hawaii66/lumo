import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  CREDIT_CONFIG_KEY,
  DEBUG_TOP_UP_AMOUNTS,
  DEFAULT_CHAT_CREDIT_COST,
  DEFAULT_FREE_DAILY_CREDITS,
  DEFAULT_TWIN_CREDIT_COST,
  assertNonNegInt,
  assertPositiveInt,
  insufficientCreditsError,
  isDebugTopUpAmount,
  nextStockholmMidnightMs,
  stockholmDateString,
  type CreditConfigValues,
  type CreditLedgerKind,
} from "./lib/credits";

type DbCtx = MutationCtx | QueryCtx;

const costsValidator = v.object({
  chatCreditCost: v.number(),
  twinCreditCost: v.number(),
  freeDailyCredits: v.number(),
});

const balanceValidator = v.object({
  dailyRemaining: v.number(),
  paidBalance: v.number(),
  totalAvailable: v.number(),
  nextResetAt: v.number(),
  costs: costsValidator,
});

const MISSING_CONFIG_ERROR =
  "creditConfig saknas — kör credits.createConfig först";

async function requireConfig(ctx: DbCtx): Promise<Doc<"creditConfig">> {
  const existing = await ctx.db
    .query("creditConfig")
    .withIndex("by_key", (q) => q.eq("key", CREDIT_CONFIG_KEY))
    .unique();
  if (existing === null) {
    throw new Error(MISSING_CONFIG_ERROR);
  }
  return existing;
}

function configValues(doc: Doc<"creditConfig">): CreditConfigValues {
  return {
    freeDailyCredits: doc.freeDailyCredits,
    chatCreditCost: doc.chatCreditCost,
    twinCreditCost: doc.twinCreditCost,
  };
}

async function appendLedger(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    delta: number;
    balanceAfterDaily: number;
    balanceAfterPaid: number;
    kind: CreditLedgerKind;
    refId?: string;
  },
) {
  await ctx.db.insert("creditLedger", {
    userId: args.userId,
    delta: args.delta,
    balanceAfterDaily: args.balanceAfterDaily,
    balanceAfterPaid: args.balanceAfterPaid,
    kind: args.kind,
    refId: args.refId,
    createdAt: Date.now(),
  });
}

/**
 * Ensure a balance row exists and today's free grant is applied (use-or-lose).
 * Requires creditConfig to already exist.
 */
async function ensureBalanceWithDailyGrant(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"creditBalances">> {
  const config = await requireConfig(ctx);
  const today = stockholmDateString();
  const now = Date.now();

  const existing = await ctx.db
    .query("creditBalances")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  if (existing === null) {
    const id = await ctx.db.insert("creditBalances", {
      userId,
      dailyRemaining: config.freeDailyCredits,
      dailyGrantDate: today,
      paidBalance: 0,
      updatedAt: now,
    });
    await appendLedger(ctx, {
      userId,
      delta: config.freeDailyCredits,
      balanceAfterDaily: config.freeDailyCredits,
      balanceAfterPaid: 0,
      kind: "daily_grant",
    });
    const created = await ctx.db.get(id);
    if (created === null) {
      throw new Error("Kunde inte skapa creditBalances");
    }
    return created;
  }

  if (existing.dailyGrantDate === today) {
    return existing;
  }

  // New day: discard leftover daily, refill to freeDailyCredits. Paid untouched.
  await ctx.db.patch(existing._id, {
    dailyRemaining: config.freeDailyCredits,
    dailyGrantDate: today,
    updatedAt: now,
  });
  await appendLedger(ctx, {
    userId,
    delta: config.freeDailyCredits,
    balanceAfterDaily: config.freeDailyCredits,
    balanceAfterPaid: existing.paidBalance,
    kind: "daily_grant",
  });
  const refreshed = await ctx.db.get(existing._id);
  if (refreshed === null) {
    throw new Error("Kunde inte uppdatera creditBalances");
  }
  return refreshed;
}

async function spendCredits(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    amount: number;
    kind: "spend_chat" | "spend_twin";
    refId?: string;
  },
): Promise<{ fromDaily: number; fromPaid: number }> {
  assertPositiveInt("amount", args.amount);
  const balance = await ensureBalanceWithDailyGrant(ctx, args.userId);
  const available = balance.dailyRemaining + balance.paidBalance;
  if (available < args.amount) {
    throw insufficientCreditsError(available, args.amount);
  }

  const fromDaily = Math.min(balance.dailyRemaining, args.amount);
  const fromPaid = args.amount - fromDaily;
  const dailyRemaining = balance.dailyRemaining - fromDaily;
  const paidBalance = balance.paidBalance - fromPaid;
  const now = Date.now();

  await ctx.db.patch(balance._id, {
    dailyRemaining,
    paidBalance,
    updatedAt: now,
  });
  await appendLedger(ctx, {
    userId: args.userId,
    delta: -args.amount,
    balanceAfterDaily: dailyRemaining,
    balanceAfterPaid: paidBalance,
    kind: args.kind,
    refId: args.refId,
  });

  return { fromDaily, fromPaid };
}

async function refundCredits(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    fromDaily: number;
    fromPaid: number;
    refId?: string;
  },
) {
  assertNonNegInt("fromDaily", args.fromDaily);
  assertNonNegInt("fromPaid", args.fromPaid);
  const amount = args.fromDaily + args.fromPaid;
  if (amount === 0) {
    return;
  }

  const balance = await ensureBalanceWithDailyGrant(ctx, args.userId);
  const dailyRemaining = balance.dailyRemaining + args.fromDaily;
  const paidBalance = balance.paidBalance + args.fromPaid;
  const now = Date.now();

  await ctx.db.patch(balance._id, {
    dailyRemaining,
    paidBalance,
    updatedAt: now,
  });
  await appendLedger(ctx, {
    userId: args.userId,
    delta: amount,
    balanceAfterDaily: dailyRemaining,
    balanceAfterPaid: paidBalance,
    kind: "refund",
    refId: args.refId,
  });
}

/** Create the singleton creditConfig. Fails if it already exists. */
export const createConfig = mutation({
  args: {
    chatCreditCost: v.optional(v.number()),
    twinCreditCost: v.optional(v.number()),
    freeDailyCredits: v.optional(v.number()),
  },
  returns: costsValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const existing = await ctx.db
      .query("creditConfig")
      .withIndex("by_key", (q) => q.eq("key", CREDIT_CONFIG_KEY))
      .unique();
    if (existing !== null) {
      throw new Error("creditConfig finns redan");
    }

    const chatCreditCost = args.chatCreditCost ?? DEFAULT_CHAT_CREDIT_COST;
    const twinCreditCost = args.twinCreditCost ?? DEFAULT_TWIN_CREDIT_COST;
    const freeDailyCredits =
      args.freeDailyCredits ?? DEFAULT_FREE_DAILY_CREDITS;

    assertPositiveInt("chatCreditCost", chatCreditCost);
    assertPositiveInt("twinCreditCost", twinCreditCost);
    assertNonNegInt("freeDailyCredits", freeDailyCredits);

    await ctx.db.insert("creditConfig", {
      key: CREDIT_CONFIG_KEY,
      chatCreditCost,
      twinCreditCost,
      freeDailyCredits,
      updatedAt: Date.now(),
    });

    return { chatCreditCost, twinCreditCost, freeDailyCredits };
  },
});

/**
 * Read balance. Returns null if logged out or creditConfig is missing
 * (create via createConfig). Spend paths throw if config is missing.
 */
export const getMyBalance = query({
  args: {},
  returns: v.union(v.null(), balanceValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const configDoc = await ctx.db
      .query("creditConfig")
      .withIndex("by_key", (q) => q.eq("key", CREDIT_CONFIG_KEY))
      .unique();
    if (configDoc === null) {
      return null;
    }
    const costs = configValues(configDoc);
    const today = stockholmDateString();
    const existing = await ctx.db
      .query("creditBalances")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    if (existing === null) {
      return {
        dailyRemaining: costs.freeDailyCredits,
        paidBalance: 0,
        totalAvailable: costs.freeDailyCredits,
        nextResetAt: nextStockholmMidnightMs(),
        costs,
      };
    }

    if (existing.dailyGrantDate !== today) {
      return {
        dailyRemaining: costs.freeDailyCredits,
        paidBalance: existing.paidBalance,
        totalAvailable: costs.freeDailyCredits + existing.paidBalance,
        nextResetAt: nextStockholmMidnightMs(),
        costs,
      };
    }

    return {
      dailyRemaining: existing.dailyRemaining,
      paidBalance: existing.paidBalance,
      totalAvailable: existing.dailyRemaining + existing.paidBalance,
      nextResetAt: nextStockholmMidnightMs(),
      costs,
    };
  },
});

export const getConfig = query({
  args: {},
  returns: v.union(v.null(), costsValidator),
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("creditConfig")
      .withIndex("by_key", (q) => q.eq("key", CREDIT_CONFIG_KEY))
      .unique();
    if (existing === null) {
      return null;
    }
    return configValues(existing);
  },
});

export const updateConfig = mutation({
  args: {
    chatCreditCost: v.optional(v.number()),
    twinCreditCost: v.optional(v.number()),
    freeDailyCredits: v.optional(v.number()),
  },
  returns: costsValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    if (args.chatCreditCost !== undefined) {
      assertPositiveInt("chatCreditCost", args.chatCreditCost);
    }
    if (args.twinCreditCost !== undefined) {
      assertPositiveInt("twinCreditCost", args.twinCreditCost);
    }
    if (args.freeDailyCredits !== undefined) {
      assertNonNegInt("freeDailyCredits", args.freeDailyCredits);
    }

    const config = await requireConfig(ctx);
    const patch: Partial<Doc<"creditConfig">> = { updatedAt: Date.now() };
    if (args.chatCreditCost !== undefined) {
      patch.chatCreditCost = args.chatCreditCost;
    }
    if (args.twinCreditCost !== undefined) {
      patch.twinCreditCost = args.twinCreditCost;
    }
    if (args.freeDailyCredits !== undefined) {
      patch.freeDailyCredits = args.freeDailyCredits;
    }
    await ctx.db.patch(config._id, patch);
    const updated = await ctx.db.get(config._id);
    if (updated === null) {
      throw new Error("Kunde inte uppdatera creditConfig");
    }
    return configValues(updated);
  },
});

export const debugGrantTodayFree = mutation({
  args: {},
  returns: balanceValidator,
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const config = await requireConfig(ctx);
    const today = stockholmDateString();
    const now = Date.now();
    const balance = await ensureBalanceWithDailyGrant(ctx, userId);

    await ctx.db.patch(balance._id, {
      dailyRemaining: config.freeDailyCredits,
      dailyGrantDate: today,
      updatedAt: now,
    });
    await appendLedger(ctx, {
      userId,
      delta: config.freeDailyCredits,
      balanceAfterDaily: config.freeDailyCredits,
      balanceAfterPaid: balance.paidBalance,
      kind: "admin_adjust",
      refId: "debugGrantTodayFree",
    });
    const refreshed = await ctx.db.get(balance._id);
    if (refreshed === null) {
      throw new Error("Kunde inte uppdatera creditBalances");
    }

    return {
      dailyRemaining: refreshed.dailyRemaining,
      paidBalance: refreshed.paidBalance,
      totalAvailable: refreshed.dailyRemaining + refreshed.paidBalance,
      nextResetAt: nextStockholmMidnightMs(),
      costs: configValues(config),
    };
  },
});

export const debugTopUp = mutation({
  args: { amount: v.number() },
  returns: balanceValidator,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }
    if (!isDebugTopUpAmount(args.amount)) {
      throw new Error(
        `Ogiltig top-up. Tillåtna: ${DEBUG_TOP_UP_AMOUNTS.join(", ")}`,
      );
    }

    const config = await requireConfig(ctx);
    const balance = await ensureBalanceWithDailyGrant(ctx, userId);
    const paidBalance = balance.paidBalance + args.amount;
    const now = Date.now();

    await ctx.db.patch(balance._id, {
      paidBalance,
      updatedAt: now,
    });
    await appendLedger(ctx, {
      userId,
      delta: args.amount,
      balanceAfterDaily: balance.dailyRemaining,
      balanceAfterPaid: paidBalance,
      kind: "purchase",
      refId: `debugTopUp:${args.amount}`,
    });

    return {
      dailyRemaining: balance.dailyRemaining,
      paidBalance,
      totalAvailable: balance.dailyRemaining + paidBalance,
      nextResetAt: nextStockholmMidnightMs(),
      costs: configValues(config),
    };
  },
});

export const spendForChat = internalMutation({
  args: {
    userId: v.id("users"),
    refId: v.optional(v.string()),
  },
  returns: v.object({ fromDaily: v.number(), fromPaid: v.number() }),
  handler: async (ctx, args) => {
    const config = await requireConfig(ctx);
    return await spendCredits(ctx, {
      userId: args.userId,
      amount: config.chatCreditCost,
      kind: "spend_chat",
      refId: args.refId,
    });
  },
});

export const spendForTwin = internalMutation({
  args: {
    userId: v.id("users"),
    refId: v.optional(v.string()),
  },
  returns: v.object({ fromDaily: v.number(), fromPaid: v.number() }),
  handler: async (ctx, args) => {
    const config = await requireConfig(ctx);
    return await spendCredits(ctx, {
      userId: args.userId,
      amount: config.twinCreditCost,
      kind: "spend_twin",
      refId: args.refId,
    });
  },
});

export const refundSpend = internalMutation({
  args: {
    userId: v.id("users"),
    fromDaily: v.number(),
    fromPaid: v.number(),
    refId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await refundCredits(ctx, args);
    return null;
  },
});
