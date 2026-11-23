import { Agent } from "@convex-dev/agent";
import { Output } from "ai";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  DEFAULT_CHAT_MODE,
  chatModeValidator,
  chatModelLevelValidator,
  chatReplySchema,
} from "../lib/lumoContent";
import type { ChatMode } from "../lib/lumoContent";
import {
  LUMO_CHAT_INSTRUCTIONS,
  buildChatSystem,
  buildRoomContext,
} from "../lib/prompts";
import {
  normalizeSubproblemLetter,
  sliceProblemTexts,
} from "../lib/subproblemSlice";
import {
  aiTelemetry,
  forceFlushPosthogTraces,
} from "../lib/posthogOtel";
import { userFacingChatError } from "../lib/chatErrors";
import { chatUsageHandler } from "../usage";
import {
  DEFAULT_LUMO_CHAT_MODEL_ID,
  lumoChatModel,
  lumoChatModelFor,
} from "./openrouter";

/** Single-pass chat: solve + present as markdown + quickReplies. */
export const roomAgent = new Agent(components.agent, {
  name: "Lumo",
  languageModel: lumoChatModel,
  instructions: LUMO_CHAT_INSTRUCTIONS,
});

function buildProblemContext(
  problems: Array<{
    problemNumber: string;
    questionText: string;
    answerText: string;
  }>,
  subproblemLetter?: string | null,
): string {
  if (problems.length === 0) return "";
  const letter = normalizeSubproblemLetter(subproblemLetter);
  const scopedProblems = problems.map((problem) => {
    if (letter === null) return problem;
    const sliced = sliceProblemTexts(
      problem.questionText,
      problem.answerText,
      letter,
    );
    if (sliced === null) return problem;
    return {
      problemNumber: problem.problemNumber,
      questionText: sliced.questionText,
      answerText: sliced.answerText,
    };
  });
  const blocks = scopedProblems.map((problem) => {
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
  const scopeHint =
    letter !== null
      ? `Omfång: endast deluppgift (${letter}) (+ gemensam ingress). Ignorera övriga deluppgifter.`
      : "Lös det studenten frågar om i denna kontext. Om flera (a)/(b) finns: bara de som behövs.";
  return [
    "",
    "════════════════════════════════════════",
    "UPPGIFTSKONTEXT (studenten refererar hit)",
    "════════════════════════════════════════",
    scopeHint,
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

export const generateResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    userId: v.id("users"),
    mode: v.optional(chatModeValidator),
    modelId: v.optional(v.string()),
    modelLevel: v.optional(chatModelLevelValidator),
    roomId: v.optional(v.id("rooms")),
    problemIds: v.optional(v.array(v.id("problems"))),
    subproblemLetter: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const mode: ChatMode = args.mode ?? DEFAULT_CHAT_MODE;
    const modelId =
      args.modelId?.trim() || DEFAULT_LUMO_CHAT_MODEL_ID;
    const languageModel = lumoChatModelFor(modelId);

    let roomContext = "";
    if (args.roomId !== undefined) {
      const room: {
        name: string;
        description: string;
        generalInfo: string;
        pdfInfos: Array<{ text: string }>;
      } | null = await ctx.runQuery(internal.rooms.getChatContext, {
        roomId: args.roomId,
      });
      if (room !== null) {
        roomContext = buildRoomContext(room);
      }
    }

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
      problemContext = buildProblemContext(problems, args.subproblemLetter);
    }

    try {
      const result = await roomAgent.streamText(
        ctx,
        { threadId: args.threadId, userId: args.userId },
        {
          promptMessageId: args.promptMessageId,
          model: languageModel,
          output: Output.object({
            schema: chatReplySchema,
            name: "ChatReply",
            description:
              "Lumo-svar: version 2, markdown med $ / $$ och ### (a) / #### Fall N, plus quickReplies.",
          }),
          system: buildChatSystem({ mode, roomContext, problemContext }),
          experimental_telemetry: aiTelemetry({
            functionId: "room-agent",
            distinctId: args.userId,
            sessionId: args.threadId,
          }),
        },
        {
          saveStreamDeltas: { chunking: "word", throttleMs: 100 },
          usageHandler: chatUsageHandler(mode),
        },
      );

      await result.consumeStream();
    } catch (error: unknown) {
      // Pending assistant turn is already marked failed by the agent with the
      // raw provider error; listMessages maps that into a user-facing bubble.
      console.error(
        "roomAgent.generateResponse failed:",
        userFacingChatError(error),
        error,
      );
    }
    await forceFlushPosthogTraces();
    return null;
  },
});
