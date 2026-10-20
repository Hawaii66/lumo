import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  lumoParsedProblemAzureSchema,
  lumoParsedProblemValidator,
  normalizeLumoParsedProblem,
  normalizeProblemNumber,
} from "../lib/lumoContent";
import {
  LUMO_PROBLEM_INSTRUCTIONS,
  buildConvertPrompt,
} from "../lib/prompts";
import { openrouter } from "../agents/openrouter";

export const lumoProblemAgent = new Agent(components.agent, {
  name: "LumoProblemConverter",
  languageModel: openrouter("openai/gpt-4.1-mini"),
  instructions: LUMO_PROBLEM_INSTRUCTIONS,
});

/**
 * Convert one pre-split problem+answer chunk into a Lumo-language problem.
 */
export const convertProblemChunk = internalAction({
  args: {
    userId: v.id("users"),
    problemNumber: v.string(),
    problemText: v.string(),
    answerText: v.string(),
  },
  returns: lumoParsedProblemValidator,
  handler: async (ctx, args) => {
    const problemText = args.problemText.trim();
    const answerText = args.answerText.trim();
    const suggestedNumber = normalizeProblemNumber(
      args.problemNumber,
      args.problemNumber,
    );

    const result = await lumoProblemAgent.generateObject(
      ctx,
      { userId: args.userId },
      {
        // Flat schema — Azure rejects JSON Schema `oneOf` from Zod unions.
        schema: lumoParsedProblemAzureSchema,
        schemaName: "LumoParsedProblem",
        schemaDescription:
          "Lumo-problem: text=svenska, latex=matte (P_{1} m.m.); subproblem=tasks; case=villkorsfall i svar; caption för Mgn/summa",
        prompt: buildConvertPrompt({
          suggestedNumber,
          problemText,
          answerText,
        }),
      },
      {
        storageOptions: { saveMessages: "none" },
        contextOptions: { recentMessages: 0 },
      },
    );

    const normalized = normalizeLumoParsedProblem(
      result.object,
      problemText,
      answerText,
    );
    return {
      ...normalized,
      problemNumber:
        normalized.problemNumber.length > 0
          ? normalized.problemNumber
          : suggestedNumber,
    };
  },
});
