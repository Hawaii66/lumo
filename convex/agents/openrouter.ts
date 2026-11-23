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
export const DEFAULT_LUMO_CHAT_MODEL_ID = "openai/gpt-4.1-mini";

export const lumoChatModel = openrouter(DEFAULT_LUMO_CHAT_MODEL_ID, {
  usage: { include: true },
});

/** Per-call OpenRouter model (chat tiers). Always include usage for cost USD. */
export function lumoChatModelFor(modelId: string) {
  const id = modelId.trim().length > 0 ? modelId.trim() : DEFAULT_LUMO_CHAT_MODEL_ID;
  return openrouter(id, { usage: { include: true } });
}
