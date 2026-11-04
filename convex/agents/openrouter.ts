import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { env } from "../_generated/server";

/**
 * OpenRouter provider (no Convex AI Gateway).
 * Set OPENROUTER_API_KEY with: npx convex env set OPENROUTER_API_KEY <key>
 */
export const openrouter = createOpenRouter(
  env.OPENROUTER_API_KEY ? { apiKey: env.OPENROUTER_API_KEY } : undefined,
);

/**
 * Shared chat model with OpenRouter usage accounting enabled so
 * `providerMetadata.openrouter.usage.cost` (USD) is available after each call.
 */
export const lumoChatModel = openrouter("openai/gpt-4.1-mini", {
  usage: { include: true },
});
