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
  DEFAULT_TWIN_CREDIT_COST,
  assertNonNegInt,
  assertPositiveInt,
  insufficientCreditsError,
  isDebugTopUpAmount,
  nextStockholmMidnightMs,
  stockholmDateString,
  type CreditConfigValues,
  type CreditLedgerKind,
  type UserCreditCosts,
} from "./lib/credits";
import { getUserRole, getUserRoleEnsured, requireAdmin } from "./lib/roles";
import { posthog } from "./posthog";

type DbCtx = MutationCtx | QueryCtx;

const pricingValidator = v.object({
  chatCreditCost: v.number(),
  twinCreditCost: v.number(),
});

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
    dealId?: Id<"creditDeals">;
  },
) {
  await ctx.db.insert("creditLedger", {
    userId: args.userId,
    delta: args.delta,
    balanceAfterDaily: args.balanceAfterDaily,
    balanceAfterPaid: args.balanceAfterPaid,
    kind: args.kind,
    refId: args.refId,
    dealId: args.dealId,
    createdAt: Date.now(),
  });
}

/**
 * Ensure a balance row exists and today's free grant is applied (use-or-lose).
 * Requires creditConfig. Grant amount comes from the user's role.
 */
async function ensureBalanceWithDailyGrant(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"creditBalances">> {
  await requireConfig(ctx);
  const role = await getUserRoleEnsured(ctx, userId);
  const freeDailyCredits = role.freeDailyCredits;
  const today = stockholmDateString();
  const now = Date.now();

  const existing = await ctx.db
    .query("creditBalances")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();

  if (existing === null) {
    const id = await ctx.db.insert("creditBalances", {
      userId,
      dailyRemaining: freeDailyCredits,
      dailyGrantDate: today,
      paidBalance: 0,
      updatedAt: now,
    });
    await appendLedger(ctx, {
      userId,
      delta: freeDailyCredits,
      balanceAfterDaily: freeDailyCredits,
      balanceAfterPaid: 0,
      kind: "daily_grant",
    });
    await posthog.capture(ctx, {
      distinctId: userId,
      event: "credit_granted",
      properties: { amount: freeDailyCredits, kind: "daily_grant" },
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

  // New day: discard leftover daily, refill to role freeDailyCredits. Paid untouched.
  await ctx.db.patch(existing._id, {
    dailyRemaining: freeDailyCredits,
    dailyGrantDate: today,
    updatedAt: now,
  });
  await appendLedger(ctx, {
    userId,
    delta: freeDailyCredits,
    balanceAfterDaily: freeDailyCredits,
    balanceAfterPaid: existing.paidBalance,
    kind: "daily_grant",
  });
  await posthog.capture(ctx, {
    distinctId: userId,
    event: "credit_granted",
    properties: { amount: freeDailyCredits, kind: "daily_grant" },
  });
  const refreshed = await ctx.db.get(existing._id);
  if (refreshed === null) {
    throw new Error("Kunde inte uppdatera creditBalances");
  }
  return refreshed;
}

/** Pricing from config + freeDailyCredits from the user's role. */
async function costsForUser(
  ctx: DbCtx,
  userId: Id<"users">,
  config: Doc<"creditConfig">,
): Promise<UserCreditCosts> {
  const role = await getUserRole(ctx, userId);
  return {
    freeDailyCredits: role.freeDailyCredits,
    chatCreditCost: config.chatCreditCost,
    twinCreditCost: config.twinCreditCost,
  };
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
  await posthog.capture(ctx, {
    distinctId: args.userId,
    event: "credit_spent",
    properties: {
      amount: args.amount,
      kind: args.kind,
      fromDaily,
      fromPaid,
      ...(args.refId !== undefined ? { refId: args.refId } : {}),
    },
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
  await posthog.capture(ctx, {
    distinctId: args.userId,
    event: "credit_refunded",
    properties: {
      amount,
      kind: "refund",
      fromDaily: args.fromDaily,
      fromPaid: args.fromPaid,
      ...(args.refId !== undefined ? { refId: args.refId } : {}),
    },
  });
}

/** Create the singleton creditConfig. Fails if it already exists. */
export const createConfig = mutation({
  args: {
    chatCreditCost: v.optional(v.number()),
    twinCreditCost: v.optional(v.number()),
  },
  returns: pricingValidator,
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

    assertPositiveInt("chatCreditCost", chatCreditCost);
    assertPositiveInt("twinCreditCost", twinCreditCost);

    await ctx.db.insert("creditConfig", {
      key: CREDIT_CONFIG_KEY,
      chatCreditCost,
      twinCreditCost,
      updatedAt: Date.now(),
    });

    return { chatCreditCost, twinCreditCost };
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
    const costs = await costsForUser(ctx, userId, configDoc);
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

const purchaseEntryValidator = v.object({
  credits: v.number(),
  label: v.string(),
  dealId: v.union(v.id("creditDeals"), v.null()),
  priceSek: v.union(v.number(), v.null()),
});

const dailySpendDayValidator = v.object({
  date: v.string(),
  chatSpent: v.number(),
  twinSpent: v.number(),
  refunded: v.number(),
  /** chatSpent + twinSpent − refunded (refunds attributed to twin). */
  netSpent: v.number(),
  purchases: v.array(purchaseEntryValidator),
});

/** Oldest→newest Stockholm calendar dates covering the last `days` days (inclusive of today). */
function stockholmDatesBack(days: number, now = Date.now()): string[] {
  const dates: string[] = [];
  const seen = new Set<string>();
  let t = now;
  // Hour steps so DST transitions still land distinct calendar days.
  while (dates.length < days) {
    const d = stockholmDateString(t);
    if (!seen.has(d)) {
      seen.add(d);
      dates.push(d);
    }
    t -= 60 * 60 * 1000;
  }
  return dates.reverse();
}

type DayBucket = {
  chatSpent: number;
  twinSpent: number;
  refunded: number;
  purchases: Array<{
    credits: number;
    label: string;
    dealId: Id<"creditDeals"> | null;
    priceSek: number | null;
  }>;
};

function emptyDayBucket(): DayBucket {
  return { chatSpent: 0, twinSpent: 0, refunded: 0, purchases: [] };
}

/**
 * Credits spent per Europe/Stockholm day over a recent window.
 * Returns null if logged out. Dense day list (zeros included).
 * Splits chat vs twin; includes purchase labels for buy days.
 */
export const myDailySpend = query({
  args: { days: v.optional(v.number()) },
  returns: v.union(
    v.null(),
    v.object({
      days: v.array(dailySpendDayValidator),
      todayNetSpent: v.number(),
      totals: v.object({
        chatSpent: v.number(),
        twinSpent: v.number(),
        refunded: v.number(),
        netSpent: v.number(),
        purchased: v.number(),
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return null;
    }

    const requested = args.days ?? 14;
    const dayCount = Math.min(30, Math.max(7, Math.floor(requested)));
    const now = Date.now();
    const dateList = stockholmDatesBack(dayCount, now);
    const today = dateList[dateList.length - 1]!;
    const oldest = dateList[0]!;

    // Extra buffer so the index lower bound never clips the oldest Stockholm day.
    const rangeStart = now - (dayCount + 2) * 24 * 60 * 60 * 1000;

    const rows = await ctx.db
      .query("creditLedger")
      .withIndex("by_user_and_createdAt", (q) =>
        q.eq("userId", userId).gte("createdAt", rangeStart),
      )
      .take(5_000);

    const dealCache = new Map<
      Id<"creditDeals">,
      { name: string; priceSek: number; creditsGranted: number } | null
    >();
    const dealsByCredits = new Map<
      number,
      { _id: Id<"creditDeals">; name: string; priceSek: number }
    >();
    const catalog = await ctx.db.query("creditDeals").take(100);
    for (const deal of catalog) {
      dealCache.set(deal._id, {
        name: deal.name,
        priceSek: deal.priceSek,
        creditsGranted: deal.creditsGranted,
      });
      // Prefer active deals when matching older purchase rows without dealId.
      const existing = dealsByCredits.get(deal.creditsGranted);
      if (existing === undefined || deal.active) {
        dealsByCredits.set(deal.creditsGranted, {
          _id: deal._id,
          name: deal.name,
          priceSek: deal.priceSek,
        });
      }
    }

    async function resolveDeal(dealId: Id<"creditDeals">) {
      if (dealCache.has(dealId)) {
        return dealCache.get(dealId)!;
      }
      const deal = await ctx.db.get(dealId);
      const resolved =
        deal === null
          ? null
          : {
              name: deal.name,
              priceSek: deal.priceSek,
              creditsGranted: deal.creditsGranted,
            };
      dealCache.set(dealId, resolved);
      return resolved;
    }

    const buckets = new Map<string, DayBucket>();
    for (const date of dateList) {
      buckets.set(date, emptyDayBucket());
    }

    for (const row of rows) {
      const date = stockholmDateString(row.createdAt);
      if (date < oldest || date > today) {
        continue;
      }
      const bucket = buckets.get(date);
      if (bucket === undefined) {
        continue;
      }
      if (row.kind === "spend_chat") {
        bucket.chatSpent += -row.delta;
      } else if (row.kind === "spend_twin") {
        bucket.twinSpent += -row.delta;
      } else if (row.kind === "refund") {
        // Twin generation refunds on failure.
        bucket.refunded += row.delta;
      } else if (row.kind === "purchase") {
        const credits = row.delta;
        let dealId = row.dealId ?? null;
        let deal =
          dealId !== null ? await resolveDeal(dealId) : null;
        if (deal === null && !row.refId?.startsWith("debugTopUp:")) {
          const matched = dealsByCredits.get(credits);
          if (matched !== undefined) {
            dealId = matched._id;
            deal = {
              name: matched.name,
              priceSek: matched.priceSek,
              creditsGranted: credits,
            };
          }
        }
        let label: string;
        if (deal !== null) {
          label = deal.name;
        } else if (row.refId?.startsWith("debugTopUp:")) {
          label = `Debug top-up (${credits} credits)`;
        } else {
          label = `Köp · ${credits} credits`;
        }
        bucket.purchases.push({
          credits,
          label,
          dealId,
          priceSek: deal?.priceSek ?? null,
        });
      }
    }

    const days = dateList.map((date) => {
      const bucket = buckets.get(date)!;
      const twinNet = Math.max(0, bucket.twinSpent - bucket.refunded);
      return {
        date,
        chatSpent: bucket.chatSpent,
        twinSpent: twinNet,
        refunded: bucket.refunded,
        netSpent: bucket.chatSpent + twinNet,
        purchases: bucket.purchases,
      };
    });

    const totals = days.reduce(
      (acc, day) => {
        acc.chatSpent += day.chatSpent;
        acc.twinSpent += day.twinSpent;
        acc.refunded += day.refunded;
        acc.netSpent += day.netSpent;
        for (const p of day.purchases) {
          acc.purchased += p.credits;
        }
        return acc;
      },
      {
        chatSpent: 0,
        twinSpent: 0,
        refunded: 0,
        netSpent: 0,
        purchased: 0,
      },
    );

    const todayRow = days[days.length - 1]!;
    return {
      days,
      todayNetSpent: todayRow.netSpent,
      totals,
    };
  },
});

export const getConfig = query({
  args: {},
  returns: v.union(v.null(), pricingValidator),
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
  },
  returns: pricingValidator,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    if (args.chatCreditCost !== undefined) {
      assertPositiveInt("chatCreditCost", args.chatCreditCost);
    }
    if (args.twinCreditCost !== undefined) {
      assertPositiveInt("twinCreditCost", args.twinCreditCost);
    }

    const config = await requireConfig(ctx);
    const patch: Partial<Doc<"creditConfig">> = { updatedAt: Date.now() };
    if (args.chatCreditCost !== undefined) {
      patch.chatCreditCost = args.chatCreditCost;
    }
    if (args.twinCreditCost !== undefined) {
      patch.twinCreditCost = args.twinCreditCost;
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
    const costs = await costsForUser(ctx, userId, config);
    const today = stockholmDateString();
    const now = Date.now();
    const balance = await ensureBalanceWithDailyGrant(ctx, userId);

    await ctx.db.patch(balance._id, {
      dailyRemaining: costs.freeDailyCredits,
      dailyGrantDate: today,
      updatedAt: now,
    });
    await appendLedger(ctx, {
      userId,
      delta: costs.freeDailyCredits,
      balanceAfterDaily: costs.freeDailyCredits,
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
      costs,
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
    const costs = await costsForUser(ctx, userId, config);
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
      costs,
    };
  },
});

/**
 * Grant paid credits after Stripe Checkout succeeds.
 * Idempotent on `stripeRefId` (Checkout session id).
 */
export const grantPurchaseFromStripe = internalMutation({
  args: {
    userId: v.id("users"),
    credits: v.number(),
    stripeRefId: v.string(),
    dealId: v.optional(v.string()),
  },
  returns: v.object({
    granted: v.boolean(),
    paidBalance: v.number(),
  }),
  handler: async (ctx, args) => {
    assertPositiveInt("credits", args.credits);
    if (args.stripeRefId.trim().length === 0) {
      throw new Error("stripeRefId krävs");
    }

    const user = await ctx.db.get(args.userId);
    if (user === null) {
      throw new Error("Användare finns inte");
    }

    const existing = await ctx.db
      .query("creditLedger")
      .withIndex("by_refId", (q) => q.eq("refId", args.stripeRefId))
      .first();
    if (existing !== null) {
      const balance = await ensureBalanceWithDailyGrant(ctx, args.userId);
      return { granted: false, paidBalance: balance.paidBalance };
    }

    let dealId: Id<"creditDeals"> | undefined;
    if (args.dealId !== undefined && args.dealId.trim().length > 0) {
      const deal = await ctx.db.get(args.dealId as Id<"creditDeals">);
      if (deal !== null) {
        dealId = deal._id;
      }
    }

    await requireConfig(ctx);
    const balance = await ensureBalanceWithDailyGrant(ctx, args.userId);
    const paidBalance = balance.paidBalance + args.credits;
    const now = Date.now();

    await ctx.db.patch(balance._id, {
      paidBalance,
      updatedAt: now,
    });
    await appendLedger(ctx, {
      userId: args.userId,
      delta: args.credits,
      balanceAfterDaily: balance.dailyRemaining,
      balanceAfterPaid: paidBalance,
      kind: "purchase",
      refId: args.stripeRefId,
      dealId,
    });
    await posthog.capture(ctx, {
      distinctId: args.userId,
      event: "credit_granted",
      properties: {
        amount: args.credits,
        kind: "purchase",
        ...(dealId !== undefined ? { dealId } : {}),
      },
    });

    return { granted: true, paidBalance };
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
