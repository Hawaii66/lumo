import { Agent } from "@convex-dev/agent";
import { Output } from "ai";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  DEFAULT_CHAT_MODE,
  chatModeValidator,
  chatReplySchema,
} from "../lib/lumoContent";
import type { ChatMode } from "../lib/lumoContent";
import { LUMO_CHAT_INSTRUCTIONS, buildChatSystem } from "../lib/prompts";
import { openrouter } from "./openrouter";

/** Single-pass chat: solve + present as markdown + quickReplies. */
export const roomAgent = new Agent(components.agent, {
  name: "Lumo",
  languageModel: openrouter("openai/gpt-4.1-mini"),
  instructions: LUMO_CHAT_INSTRUCTIONS,
});

function buildProblemContext(
  problems: Array<{
    problemNumber: string;
    questionText: string;
    answerText: string;
  }>,
): string {
  if (problems.length === 0) return "";
  const blocks = problems.map((problem) => {
    const answer =
      problem.answerText.length > 0
        ? problem.answerText
        : "(inget facit i källan)";
    return [
      `Uppgift ${problem.problemNumber}`,
      `Fråga: ${problem.questionText}`,
      `Facit från boken: ${answer}`,
      "Krav: slutsvaret i markdown MÅSTE matcha facit. Bygg korrekta mellansteg dit.",
    ].join("\n");
  });
  return [
    "",
    "════════════════════════════════════════",
    "UPPGIFTSKONTEXT (studenten refererar hit)",
    "════════════════════════════════════════",
    "Lös det studenten frågar om i denna kontext. Om flera (a)/(b) finns: bara de som behövs.",
    "",
    blocks.join("\n\n"),
  ].join("\n");
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
      problemContext = buildProblemContext(problems);
    }

    const result = await roomAgent.streamText(
      ctx,
      { threadId: args.threadId },
      {
        promptMessageId: args.promptMessageId,
        output: Output.object({
          schema: chatReplySchema,
          name: "ChatReply",
          description:
            "Lumo-svar: version 2, markdown med $ / $$ och ### (a) / #### Fall N, plus quickReplies.",
        }),
        system: buildChatSystem({ mode, problemContext }),
      },
      {
        saveStreamDeltas: { chunking: "word", throttleMs: 100 },
      },
    );

    await result.consumeStream();
    return null;
  },
});
