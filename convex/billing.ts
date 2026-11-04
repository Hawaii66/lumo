import { getAuthUserId } from "@convex-dev/auth/server";
import { StripeSubscriptions } from "@convex-dev/stripe";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env } from "./_generated/server";

const stripeClient = new StripeSubscriptions(components.stripe, {
  STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
});

type ActiveDeal = {
  _id: Id<"creditDeals">;
  name: string;
  description: string;
  priceSek: number;
  creditsGranted: number;
  active: boolean;
  sortOrder: number;
};

function requireSiteUrl(): string {
  const siteUrl = env.SITE_URL?.replace(/\/$/, "");
  if (!siteUrl) {
    throw new Error("SITE_URL saknas — sätt med npx convex env set SITE_URL …");
  }
  return siteUrl;
}

/**
 * Start Stripe Checkout for an active credit deal.
 * Amount comes from `creditDeals.priceSek` (inline price_data, no Price IDs).
 */
export const createDealCheckout = action({
  args: { dealId: v.id("creditDeals") },
  returns: v.object({
    sessionId: v.string(),
    url: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args): Promise<{ sessionId: string; url: string | null }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      throw new Error("Du måste vara inloggad");
    }

    const selected: ActiveDeal | null = await ctx.runQuery(
      internal.creditDeals.getActiveDeal,
      { dealId: args.dealId },
    );
    if (selected === null) {
      throw new Error("Deal finns inte eller är inaktiv");
    }

    const customer = await stripeClient.getOrCreateCustomer(ctx, {
      userId,
      email: identity.email,
      name: identity.name,
    });

    const siteUrl = requireSiteUrl();
    const metadata: Record<string, string> = {
      userId,
      dealId: selected._id,
      creditsGranted: String(selected.creditsGranted),
    };

    // priceId is required by the helper but overridden by params.line_items.
    return await stripeClient.createCheckoutSession(ctx, {
      priceId: "price_unused_overridden",
      customerId: customer.customerId,
      mode: "payment",
      successUrl: `${siteUrl}/?topup=success`,
      cancelUrl: `${siteUrl}/?topup=canceled`,
      metadata,
      paymentIntentMetadata: metadata,
      params: {
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "sek",
              unit_amount: selected.priceSek * 100,
              product_data: {
                name: selected.name,
                description: selected.description,
              },
            },
          },
        ],
      },
    });
  },
});
