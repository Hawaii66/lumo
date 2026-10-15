import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  LUMO_PROTOCOL_INSTRUCTIONS,
  helpLevelValidator,
  lumoDocumentSchema,
} from "../lib/lumoContent";
import type { HelpLevel } from "../lib/lumoContent";
import { openrouter } from "./openrouter";

export const roomAgent = new Agent(components.agent, {
  name: "Lumo",
  languageModel: openrouter("openai/gpt-4o-mini"),
  instructions: LUMO_PROTOCOL_INSTRUCTIONS,
});

function helpLevelHint(helpLevel: HelpLevel): string {
  switch (helpLevel) {
    case "minimal":
      return "Hjälpnivå: minimal — ge ledtrådar, fillBlank och/eller quickReplies. Ge inte hela lösningen.";
    case "explain":
      return "Hjälpnivå: explain — guidad solution med steg studenten fyller i. Förklara tanken.";
    case "solve":
      return "Hjälpnivå: solve — fullständig solution med interaktiva steg (fortfarande fill-in i varje steg).";
  }
}

export const generateResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    helpLevel: v.optional(helpLevelValidator),
  },
  handler: async (ctx, args) => {
    const helpLevel: HelpLevel = args.helpLevel ?? "explain";

    await roomAgent.generateObject(
      ctx,
      { threadId: args.threadId },
      {
        promptMessageId: args.promptMessageId,
        schema: lumoDocumentSchema,
        system: `${LUMO_PROTOCOL_INSTRUCTIONS}\n\n${helpLevelHint(helpLevel)}`,
      },
    );
  },
});
