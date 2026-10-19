import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  DEFAULT_CHAT_MODE,
  LUMO_PROTOCOL_INSTRUCTIONS,
  chatModeValidator,
  lumoDocumentAzureSchema,
  normalizeLumoDocument,
  stringifyLumoDocument,
  validateLumoDocument,
} from "../lib/lumoContent";
import type { ChatMode } from "../lib/lumoContent";
import { openrouter } from "./openrouter";

export const roomAgent = new Agent(components.agent, {
  name: "Lumo",
  languageModel: openrouter("openai/gpt-4o-mini"),
  instructions: LUMO_PROTOCOL_INSTRUCTIONS,
});

function chatModeHint(mode: ChatMode): string {
  switch (mode) {
    case "normal":
      return "Chattläge: normal — svara naturligt enligt protokollet. Inget tvunget interaktionsformat.";
    case "fillBlank":
      return "Chattläge: fillBlank — skapa guidad solution med steg och fillBlank-luckor studenten fyller i. Ge inte hela facit i klartext.";
    case "thoughtProcess":
      return "Chattläge: thoughtProcess — förklara tankegången steg för steg (gärna med interaktiva steg). Fokus på hur man tänker.";
    case "answerBoxes":
      return "Chattläge: answerBoxes — skapa bara slutliga fillBlank-svarsrutor för uppgiften. Ingen solution-genomgång, ingen facit-prosa.";
  }
}

export const generateResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    mode: v.optional(chatModeValidator),
    roomId: v.optional(v.id("rooms")),
    problemIds: v.optional(v.array(v.id("problems"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const mode: ChatMode = args.mode ?? DEFAULT_CHAT_MODE;

    let problemContext = "";
    if (
      args.roomId !== undefined &&
      args.problemIds !== undefined &&
      args.problemIds.length > 0
    ) {
      const problems: Array<{
        problemNumber: string;
        questionText: string;
      }> = await ctx.runQuery(internal.PDFParse.problems.getPromptContexts, {
        roomId: args.roomId,
        problemIds: args.problemIds,
      });
      if (problems.length > 0) {
        const blocks = problems.map(
          (problem) =>
            `Uppgift ${problem.problemNumber}:\n${problem.questionText}`,
        );
        problemContext = `\n\nStudenten refererar till följande uppgifter (använd som kontext; visa inte facit om läget förbjuder det):\n\n${blocks.join("\n\n")}`;
      }
    }

    // Flat schema — OpenAI rejects JSON Schema `oneOf` from Zod unions.
    const result = await roomAgent.generateObject(
      ctx,
      { threadId: args.threadId },
      {
        promptMessageId: args.promptMessageId,
        schema: lumoDocumentAzureSchema,
        schemaName: "LumoDocument",
        schemaDescription:
          "Lumo-svar: text/latex/fillBlank/solution/quickReplies/subproblem/case. Oanvända fält = tom sträng eller tom array.",
        system: `${LUMO_PROTOCOL_INSTRUCTIONS}\n\n${chatModeHint(mode)}${problemContext}\n\nViktigt för JSON-schemat: fyll BARA fält som hör till part-typen; övriga fält ska vara "" eller [].`,
      },
      {
        storageOptions: { saveMessages: "none" },
      },
    );

    let document = normalizeLumoDocument(result.object);
    const validationError = validateLumoDocument(document);
    if (validationError !== null) {
      document = {
        version: 1,
        parts: [
          {
            type: "text",
            content: `Jag fick ett ogiltigt svarformat (${validationError}). Försök igen.`,
          },
        ],
      };
    }

    await roomAgent.saveMessages(ctx, {
      threadId: args.threadId,
      messages: [
        {
          role: "assistant",
          content: stringifyLumoDocument(document),
        },
      ],
      skipEmbeddings: true,
    });

    return null;
  },
});
