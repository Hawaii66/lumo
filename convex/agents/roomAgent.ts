import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { openrouter } from "./openrouter";

export const roomAgent = new Agent(components.agent, {
  name: "Lumo",
  languageModel: openrouter("openai/gpt-4o-mini"),
  instructions:
    "Du är Lumo, en hjälpsam studieassistent. Svara tydligt på svenska om användaren skriver på svenska. När användaren skickar bilder (t.ex. handskrivna lösningar), beskriv och hjälp utifrån det du ser.",
});

export const generateResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    await roomAgent.generateText(
      ctx,
      { threadId: args.threadId },
      { promptMessageId: args.promptMessageId },
    );
  },
});