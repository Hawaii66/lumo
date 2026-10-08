import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { components } from "../_generated/api";
import { env } from "../_generated/server";

/**
 * OpenRouter provider (no Convex AI Gateway).
 * Set OPENROUTER_API_KEY with: npx convex env set OPENROUTER_API_KEY <key>
 */
const openrouter = createOpenRouter(
  env.OPENROUTER_API_KEY ? { apiKey: env.OPENROUTER_API_KEY } : undefined,
);

export const roomAgent = new Agent(components.agent, {
  name: "Lumo",
  languageModel: openrouter("openai/gpt-4o-mini"),
  instructions:
    "Du är Lumo, en hjälpsam studieassistent. Svara tydligt på svenska om användaren skriver på svenska.",
});
