import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import {
  createAccount,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Scrypt } from "lucia";

const TEMP_PROVIDER = "temp" as const;

/**
 * Dev-only credentials provider. Replace with Sign in with ChatGPT (openai)
 * once OpenAI issues a website OAuth client.
 *
 * Credentials come from Convex env:
 * - TEMP_AUTH_EMAIL
 * - TEMP_AUTH_PASSWORD
 */
export const TempCredentials = ConvexCredentials({
  id: TEMP_PROVIDER,
  authorize: async (credentials, ctx) => {
    const email = String(credentials.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(credentials.password ?? "");

    const expectedEmail = (process.env.TEMP_AUTH_EMAIL ?? "")
      .trim()
      .toLowerCase();
    const expectedPassword = process.env.TEMP_AUTH_PASSWORD ?? "";

    if (!expectedEmail || !expectedPassword) {
      throw new ConvexError(
        "Temp auth is not configured. Set TEMP_AUTH_EMAIL and TEMP_AUTH_PASSWORD.",
      );
    }

    if (email !== expectedEmail || password !== expectedPassword) {
      throw new ConvexError("Invalid email or password.");
    }

    let existing: Awaited<ReturnType<typeof retrieveAccount>> | null = null;
    try {
      existing = await retrieveAccount(ctx, {
        provider: TEMP_PROVIDER,
        account: { id: email },
      });
    } catch {
      existing = null;
    }

    if (existing) {
      await modifyAccountCredentials(ctx, {
        provider: TEMP_PROVIDER,
        account: { id: email, secret: password },
      });
      return { userId: existing.user._id };
    }

    const created = await createAccount(ctx, {
      provider: TEMP_PROVIDER,
      account: { id: email, secret: password },
      profile: {
        email,
        name: "Hawaii",
        emailVerificationTime: Date.now(),
      },
    });
    return { userId: created.user._id };
  },
  crypto: {
    async hashSecret(password) {
      return await new Scrypt().hash(password);
    },
    async verifySecret(password, hash) {
      return await new Scrypt().verify(hash, password);
    },
  },
});
