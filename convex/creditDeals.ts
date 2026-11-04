import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  DEFAULT_CREDIT_DEALS,
  type CreditDealFields,
} from "./lib/creditDeals";
import { assertPositiveInt } from "./lib/credits";

const dealValidator = v.object({
  _id: v.id("creditDeals"),
  name: v.string(),
  description: v.string(),
  priceSek: v.number(),
  creditsGranted: v.number(),
  active: v.boolean(),
  sortOrder: v.number(),
});

function assertDealFields(fields: CreditDealFields) {
  if (fields.name.trim().length === 0) {
    throw new Error("name får inte vara tomt");
  }
  if (fields.description.trim().length === 0) {
    throw new Error("description får inte vara tomt");
  }
  assertPositiveInt("priceSek", fields.priceSek);
  assertPositiveInt("creditsGranted", fields.creditsGranted);
  assertPositiveInt("sortOrder", fields.sortOrder);
}

/** Active deals for the buy UI, ordered by sortOrder. */
export const listActiveDeals = query({
  args: {},
  returns: v.array(dealValidator),
  handler: async (ctx) => {
    const deals = await ctx.db
      .query("creditDeals")
      .withIndex("by_active_and_sortOrder", (q) => q.eq("active", true))
      .collect();
    return deals.map((d) => ({
      _id: d._id,
      name: d.name,
      description: d.description,
      priceSek: d.priceSek,
      creditsGranted: d.creditsGranted,
      active: d.active,
      sortOrder: d.sortOrder,
    }));
  },
});

/** Load one deal for Checkout (active only). */
export const getActiveDeal = internalQuery({
  args: { dealId: v.id("creditDeals") },
  returns: v.union(v.null(), dealValidator),
  handler: async (ctx, args) => {
    const deal = await ctx.db.get(args.dealId);
    if (deal === null || !deal.active) {
      return null;
    }
    return {
      _id: deal._id,
      name: deal.name,
      description: deal.description,
      priceSek: deal.priceSek,
      creditsGranted: deal.creditsGranted,
      active: deal.active,
      sortOrder: deal.sortOrder,
    };
  },
});

/** Insert the three default packs if the catalog is empty. */
export const seedDefaultDeals = mutation({
  args: {},
  returns: v.object({ inserted: v.number() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const existing = await ctx.db.query("creditDeals").take(1);
    if (existing.length > 0) {
      return { inserted: 0 };
    }

    const now = Date.now();
    for (const deal of DEFAULT_CREDIT_DEALS) {
      await ctx.db.insert("creditDeals", {
        ...deal,
        active: true,
        updatedAt: now,
      });
    }
    return { inserted: DEFAULT_CREDIT_DEALS.length };
  },
});

export const upsertDeal = mutation({
  args: {
    dealId: v.optional(v.id("creditDeals")),
    name: v.string(),
    description: v.string(),
    priceSek: v.number(),
    creditsGranted: v.number(),
    sortOrder: v.number(),
    active: v.optional(v.boolean()),
  },
  returns: v.id("creditDeals"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    assertDealFields({
      name: args.name,
      description: args.description,
      priceSek: args.priceSek,
      creditsGranted: args.creditsGranted,
      sortOrder: args.sortOrder,
    });

    const now = Date.now();
    if (args.dealId !== undefined) {
      const existing = await ctx.db.get(args.dealId);
      if (existing === null) {
        throw new Error("Deal finns inte");
      }
      await ctx.db.patch(args.dealId, {
        name: args.name.trim(),
        description: args.description.trim(),
        priceSek: args.priceSek,
        creditsGranted: args.creditsGranted,
        sortOrder: args.sortOrder,
        active: args.active ?? existing.active,
        updatedAt: now,
      });
      return args.dealId;
    }

    return await ctx.db.insert("creditDeals", {
      name: args.name.trim(),
      description: args.description.trim(),
      priceSek: args.priceSek,
      creditsGranted: args.creditsGranted,
      sortOrder: args.sortOrder,
      active: args.active ?? true,
      updatedAt: now,
    });
  },
});

export const setDealActive = mutation({
  args: {
    dealId: v.id("creditDeals"),
    active: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }
    const existing = await ctx.db.get(args.dealId);
    if (existing === null) {
      throw new Error("Deal finns inte");
    }
    await ctx.db.patch(args.dealId, {
      active: args.active,
      updatedAt: Date.now(),
    });
    return null;
  },
});
