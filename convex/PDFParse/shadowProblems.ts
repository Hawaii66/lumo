import { Agent } from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { Output } from "ai";
import { v } from "convex/values";
import { api, components, internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  isMissingAnswer,
  lumoTwinAnswerSchema,
  lumoTwinVariantSchema,
} from "../lib/lumoContent";
import {
  LUMO_TWIN_SOLVE_INSTRUCTIONS,
  LUMO_TWIN_VARIANT_INSTRUCTIONS,
  buildTwinSolvePrompt,
  buildTwinVariantPrompt,
} from "../lib/prompts";
import {
  normalizeSubproblemLetter,
  sliceProblemTexts,
} from "../lib/subproblemSlice";
import { lumoChatModel } from "../agents/openrouter";
import {
  costUsdFromProviderMetadata,
  tokensFromSdkUsage,
} from "../usage";
import { MAX_SHADOWS_PER_PARENT } from "./problems";

const twinGenerateOpts = {
  storageOptions: { saveMessages: "none" as const },
  contextOptions: { recentMessages: 0 },
};

/** Step 1: invent twin question (new numbers, same structure). */
export const lumoTwinVariantAgent = new Agent(components.agent, {
  name: "LumoTwinVariant",
  languageModel: lumoChatModel,
  instructions: LUMO_TWIN_VARIANT_INSTRUCTIONS,
});

/** Step 2: solve twin question cold — never sees parent facit. */
export const lumoTwinSolveAgent = new Agent(components.agent, {
  name: "LumoTwinSolve",
  languageModel: lumoChatModel,
  instructions: LUMO_TWIN_SOLVE_INSTRUCTIONS,
});

/**
 * Generate one room-scoped twin (shadow) of a parsed parent problem.
 * Variant → solve in two LLM calls. Never salvages parent facit.
 * Rejects shadow-of-shadow and enforces per-parent cap.
 */
export const createShadow = action({
  args: {
    roomId: v.id("rooms"),
    parentProblemId: v.id("problems"),
    /** When set, twin only this deluppgift (plus shared stem). */
    subproblemLetter: v.optional(v.string()),
  },
  returns: v.id("problems"),
  handler: async (ctx, args): Promise<Id<"problems">> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Du måste vara inloggad");
    }

    const room = await ctx.runQuery(api.rooms.get, { roomId: args.roomId });
    if (room === null) {
      throw new Error("Du saknar åtkomst till rummet");
    }

    const letter = normalizeSubproblemLetter(args.subproblemLetter);
    if (
      args.subproblemLetter !== undefined &&
      args.subproblemLetter.trim().length > 0 &&
      letter === null
    ) {
      throw new Error("Ogiltig deluppgift — använd en bokstav a–z");
    }

    const parent: {
      parentProblemId: Id<"problems">;
      parentProblemNumber: string;
      questionText: string;
      answerText: string;
      existingShadowCount: number;
    } | null = await ctx.runQuery(
      internal.PDFParse.problems.getParentForShadow,
      {
        roomId: args.roomId,
        parentProblemId: args.parentProblemId,
      },
    );

    if (parent === null) {
      throw new Error(
        "Uppgiften hittades inte, tillhör inte rummet, eller är redan en tvilling",
      );
    }
    if (parent.existingShadowCount >= MAX_SHADOWS_PER_PARENT) {
      throw new Error(
        `Högst ${MAX_SHADOWS_PER_PARENT} tvillingar per uppgift`,
      );
    }

    let questionText = parent.questionText;
    let answerText = parent.answerText;
    if (letter !== null) {
      const sliced = sliceProblemTexts(questionText, answerText, letter);
      if (sliced === null) {
        throw new Error(`Deluppgift (${letter}) hittades inte i uppgiften`);
      }
      questionText = sliced.questionText;
      answerText = sliced.answerText;
    }

    const suggestedNumber = `${parent.parentProblemNumber}·T${parent.existingShadowCount + 1}`;

    const variantResult = await lumoTwinVariantAgent.generateText(
      ctx,
      { userId },
      {
        output: Output.object({
          schema: lumoTwinVariantSchema,
          name: "LumoTwinVariant",
          description:
            "Tvillingfråga: samma ### (a)/Fall-struktur, andra tal; ingen answer",
        }),
        prompt: buildTwinVariantPrompt({
          suggestedNumber,
          questionText,
          answerText,
          subproblemLetter: letter ?? undefined,
        }),
      },
      twinGenerateOpts,
    );

    const twinQuestion = variantResult.output.question.trim();
    if (twinQuestion.length === 0) {
      throw new Error("Kunde inte skapa tvillingfråga — försök igen");
    }

    const solveResult = await lumoTwinSolveAgent.generateText(
      ctx,
      { userId },
      {
        output: Output.object({
          schema: lumoTwinAnswerSchema,
          name: "LumoTwinAnswer",
          description:
            "ENBART slutfacit för tvillingfrågan: md+$; spegla ### (a)/Fall; inga lösningssteg; aldrig tom",
        }),
        prompt: buildTwinSolvePrompt({
          suggestedNumber,
          questionText: twinQuestion,
        }),
      },
      twinGenerateOpts,
    );

    const twinAnswer = solveResult.output.answer.trim();
    if (isMissingAnswer(twinAnswer)) {
      throw new Error("Kunde inte skapa facit för tvillingen — försök igen");
    }

    // One billable row for the whole twin (variant + solve), not two LLM steps.
    const variantTokens = tokensFromSdkUsage(variantResult.usage);
    const solveTokens = tokensFromSdkUsage(solveResult.usage);
    const variantCost = costUsdFromProviderMetadata(
      variantResult.providerMetadata as Record<string, unknown> | undefined,
    );
    const solveCost = costUsdFromProviderMetadata(
      solveResult.providerMetadata as Record<string, unknown> | undefined,
    );
    const costParts = [variantCost, solveCost].filter(
      (c): c is number => typeof c === "number",
    );

    await ctx.runMutation(internal.usage.insertUsage, {
      userId,
      chargeSource: "twin_generation",
      agentName: "LumoTwin",
      model: "openai/gpt-4.1-mini",
      provider: "openrouter",
      inputTokens: variantTokens.inputTokens + solveTokens.inputTokens,
      outputTokens: variantTokens.outputTokens + solveTokens.outputTokens,
      totalTokens: variantTokens.totalTokens + solveTokens.totalTokens,
      costUsd:
        costParts.length > 0
          ? costParts.reduce((sum, c) => sum + c, 0)
          : undefined,
    });

    const shadowId: Id<"problems"> = await ctx.runMutation(
      internal.PDFParse.problems.insertShadow,
      {
        roomId: args.roomId,
        parentProblemId: parent.parentProblemId,
        problemNumber: suggestedNumber,
        problem: twinQuestion,
        answer: twinAnswer,
      },
    );

    return shadowId;
  },
});
