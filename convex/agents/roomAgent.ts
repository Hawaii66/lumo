import { Agent } from "@convex-dev/agent";
import { Output } from "ai";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  DEFAULT_CHAT_MODE,
  LUMO_PROTOCOL_INSTRUCTIONS,
  chatModeValidator,
  lumoDocumentAzureSchema,
} from "../lib/lumoContent";
import type { ChatMode } from "../lib/lumoContent";
import { openrouter } from "./openrouter";

export const roomAgent = new Agent(components.agent, {
  name: "Lumo",
  languageModel: openrouter("openai/gpt-4.1-mini"),
  instructions: LUMO_PROTOCOL_INSTRUCTIONS,
});

function chatModeHint(mode: ChatMode): string {
  switch (mode) {
    case "normal":
      return `Chattläge: normal
• text + latex (sokratiskt). quickReplies OK.
• fillBlank/solution BARA om studenten ber om luckor/övning.
• Dumpa inte hela facit på en öppen fråga.`;
    case "fillBlank":
      return `Chattläge: fillBlank
• MÅSTE använda solution (2–5 steg med luckor) eller fillBlank.
• Kort text-hint OK — FÖRBJUDET att skriva facit i text/title/hint.
• Facit endast i prompts[].answer / solvedLatex.`;
    case "thoughtProcess":
      return `Chattläge: thoughtProcess
• Förklara HUR man tänker (text + latex).
• Lägg fillBlank/solution på kritiska mellansteg.
• Resonemang först — inte bara svarsrutor.`;
    case "answerBoxes":
      return `Chattläge: answerBoxes
• BARA fillBlank-svarsrutor (en per deluppgift om (a)/(b)).
• Max 1–2 korta textmeningar som intro.
• FÖRBJUDET: type=solution, lång genomgång, facit i text.`;
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
        answerText: string;
      }> = await ctx.runQuery(internal.PDFParse.problems.getPromptContexts, {
        roomId: args.roomId,
        problemIds: args.problemIds,
      });
      if (problems.length > 0) {
        const blocks = problems.map((problem) => {
          const answer =
            problem.answerText.length > 0
              ? problem.answerText
              : "(inget facit i källan)";
          return `Uppgift ${problem.problemNumber}:\nFråga: ${problem.questionText}\nFacit (sträva mot detta; visa inte om läget förbjuder det): ${answer}`;
        });
        problemContext = `\n\nStudenten refererar till följande uppgifter (använd som kontext; visa inte facit om läget förbjuder det):\n\n${blocks.join("\n\n")}`;
      }
    }

    // Flat schema — OpenAI rejects JSON Schema `oneOf` from Zod unions.
    // Stream deltas so the client can show tokens as they arrive.
    const result = await roomAgent.streamText(
      ctx,
      { threadId: args.threadId },
      {
        promptMessageId: args.promptMessageId,
        output: Output.object({
          schema: lumoDocumentAzureSchema,
          name: "LumoDocument",
          description:
            "Lumo-svar: text/latex/fillBlank/solution/quickReplies/subproblem/case. Oanvända fält = tom sträng eller tom array.",
        }),
        system: `${LUMO_PROTOCOL_INSTRUCTIONS}\n\n${chatModeHint(mode)}${problemContext}`,
      },
      {
        saveStreamDeltas: { chunking: "word", throttleMs: 100 },
      },
    );

    await result.consumeStream();
    return null;
  },
});
