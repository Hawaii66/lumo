import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { z } from "zod";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  LUMO_INFO_INSTRUCTIONS,
  PDF_INFO_MAX_LENGTH,
  buildInfoConvertPrompt,
} from "../lib/prompts";
import { openrouter } from "../agents/openrouter";

export const lumoInfoAgent = new Agent(components.agent, {
  name: "LumoInfoConverter",
  languageModel: openrouter("openai/gpt-4.1-mini"),
  instructions: LUMO_INFO_INSTRUCTIONS,
});

const infoResultSchema = z.object({
  text: z.string(),
});

function clampInfoText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= PDF_INFO_MAX_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, PDF_INFO_MAX_LENGTH).trimEnd();
}

/**
 * Convert full-document OCR text into distilled general-info instructions.
 */
export const convertDocumentInfo = internalAction({
  args: {
    userId: v.id("users"),
    documentText: v.string(),
  },
  returns: v.object({ text: v.string() }),
  handler: async (ctx, args) => {
    const documentText = args.documentText.trim();
    if (documentText.length === 0) {
      return { text: "" };
    }

    const result = await lumoInfoAgent.generateObject(
      ctx,
      { userId: args.userId },
      {
        schema: infoResultSchema,
        schemaName: "PdfInfo",
        schemaDescription:
          "Kursövergripande AI-styrning (metoder, policy) — inte uppgifter; tom text om bara övningar",
        prompt: buildInfoConvertPrompt(documentText),
      },
      {
        storageOptions: { saveMessages: "none" },
        contextOptions: { recentMessages: 0 },
      },
    );

    return { text: clampInfoText(result.object.text) };
  },
});
