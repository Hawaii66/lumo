import { Agent } from "@convex-dev/agent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { api, components, internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import {
  lumoParsedProblemSchema,
  normalizeLumoParsedProblem,
} from "../lib/lumoContent";
import {
  LUMO_TWIN_INSTRUCTIONS,
  buildTwinPrompt,
} from "../lib/prompts";
import {
  normalizeSubproblemLetter,
  sliceProblemTexts,
} from "../lib/subproblemSlice";
import { openrouter } from "../agents/openrouter";
import { MAX_SHADOWS_PER_PARENT } from "./problems";

export const lumoTwinAgent = new Agent(components.agent, {
  name: "LumoTwinGenerator",
  languageModel: openrouter("openai/gpt-4.1-mini"),
  instructions: LUMO_TWIN_INSTRUCTIONS,
});

/**
 * Generate one room-scoped twin (shadow) of a parsed parent problem.
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

    const result = await lumoTwinAgent.generateObject(
      ctx,
      { userId },
      {
        schema: lumoParsedProblemSchema,
        schemaName: "LumoParsedProblem",
        schemaDescription:
          "Markdown-tvilling: samma ### (a)/Fall-struktur, andra tal; question/answer som md+$",
        prompt: buildTwinPrompt({
          suggestedNumber,
          questionText,
          answerText,
          subproblemLetter: letter ?? undefined,
        }),
      },
      {
        storageOptions: { saveMessages: "none" },
        contextOptions: { recentMessages: 0 },
      },
    );

    const normalized = normalizeLumoParsedProblem(
      { ...result.object, problemNumber: suggestedNumber },
      questionText,
      answerText,
    );

    const shadowId: Id<"problems"> = await ctx.runMutation(
      internal.PDFParse.problems.insertShadow,
      {
        roomId: args.roomId,
        parentProblemId: parent.parentProblemId,
        problemNumber: suggestedNumber,
        problem: normalized.question,
        answer: normalized.answer,
      },
    );

    return shadowId;
  },
});
