import { Agent } from "@convex-dev/agent";
import { Output } from "ai";
import { v } from "convex/values";
import { components, internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  DEFAULT_CHAT_MODE,
  LUMO_FORMAT_INSTRUCTIONS,
  LUMO_SOLVE_INSTRUCTIONS,
  chatModeValidator,
  formatModeHint,
  lumoDocumentAzureSchema,
  serializeWorkedSolutionForPrompt,
  solveModeHint,
  workedSolutionSchema,
} from "../lib/lumoContent";
import type { ChatMode, WorkedSolution } from "../lib/lumoContent";
import { openrouter } from "./openrouter";

/** Pass 1: solve math only (not saved to the thread). */
export const roomSolveAgent = new Agent(components.agent, {
  name: "LumoSolve",
  languageModel: openrouter("openai/gpt-4.1-mini"),
  instructions: LUMO_SOLVE_INSTRUCTIONS,
});

/** Pass 2: format worked solution into Lumo JSON for the frontend. */
export const roomAgent = new Agent(components.agent, {
  name: "Lumo",
  languageModel: openrouter("openai/gpt-4.1-mini"),
  instructions: LUMO_FORMAT_INSTRUCTIONS,
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
    return `Uppgift ${problem.problemNumber}:\nFråga: ${problem.questionText}\nFacit (sträva mot samma svar som boken; bygg korrekta mellansteg dit): ${answer}`;
  });
  return `\n\nStudenten refererar till följande uppgifter:\n\n${blocks.join("\n\n")}`;
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
    // Current thread mode every turn (user may change mid-conversation).
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

    // Pass 1 — silent solve (depth from mode; facit when present).
    const solved = await roomSolveAgent.generateObject(
      ctx,
      { threadId: args.threadId },
      {
        promptMessageId: args.promptMessageId,
        schema: workedSolutionSchema,
        schemaName: "WorkedSolution",
        schemaDescription:
          "Arbetad lösning: subproblems med helt ifyllda latex-steg och finalLatex. Inga placeholders.",
        system: `${LUMO_SOLVE_INSTRUCTIONS}\n\n${solveModeHint(mode)}${problemContext}`,
      },
      {
        storageOptions: { saveMessages: "none" },
      },
    );

    const workedSolution: WorkedSolution = solved.object;
    const workedBlock = serializeWorkedSolutionForPrompt(workedSolution);

    // Pass 2 — stream Lumo document; copy math from pass 1, do not re-derive.
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
        system: `${LUMO_FORMAT_INSTRUCTIONS}\n\n${formatModeHint(mode)}\n\nINTERNT ARBETAD LÖSNING (källa till sanning — kopiera/lucka, omräkna inte):\n${workedBlock}`,
      },
      {
        saveStreamDeltas: { chunking: "word", throttleMs: 100 },
      },
    );

    await result.consumeStream();
    return null;
  },
});
