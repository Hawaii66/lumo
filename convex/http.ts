import { httpRouter } from "convex/server";
import { registerRoutes } from "@convex-dev/stripe";
import type Stripe from "stripe";
import { auth } from "./auth";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env } from "./_generated/server";
import {
  fixtureExport,
  fixtureStart,
  fixtureStatus,
  fixtureUploadUrl,
} from "./PDFParse/fixtureHttp";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/fixtures/split/upload-url",
  method: "POST",
  handler: fixtureUploadUrl,
});
http.route({
  path: "/fixtures/split/start",
  method: "POST",
  handler: fixtureStart,
});
http.route({
  path: "/fixtures/split/status",
  method: "GET",
  handler: fixtureStatus,
});
http.route({
  path: "/fixtures/split/export",
  method: "GET",
  handler: fixtureExport,
});

registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
  events: {
    "checkout.session.completed": async (ctx, event) => {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "payment" || session.payment_status !== "paid") {
        return;
      }

      const userId = session.metadata?.userId;
      const creditsRaw = session.metadata?.creditsGranted;
      const dealId = session.metadata?.dealId;
      if (!userId || !creditsRaw) {
        console.error(
          "checkout.session.completed missing userId/creditsGranted metadata",
          session.id,
        );
        return;
      }

      const credits = Number.parseInt(creditsRaw, 10);
      if (!Number.isFinite(credits) || credits < 1) {
        console.error(
          "checkout.session.completed invalid creditsGranted",
          session.id,
          creditsRaw,
        );
        return;
      }

      await ctx.runMutation(internal.credits.grantPurchaseFromStripe, {
        userId: userId as Id<"users">,
        credits,
        stripeRefId: session.id,
        dealId,
      });
    },
  },
});

export default http;
