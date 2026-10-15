import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { z } from "zod";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { openrouter } from "../agents/openrouter";

export const parsedProblemValidator = v.object({
  rawProblemNumber: v.string(),
  rawText: v.string(),
  rawAnswer: v.string(),
});

const parsedProblemSchema = z.object({
  rawProblemNumber: z
    .string()
    .describe("Problemnumret, t.ex. '1.1' eller 'P 1.1' som det står i källan"),
  rawText: z
    .string()
    .describe("Problemtexten i rå form, inklusive math/LaTeX, utan svar"),
  rawAnswer: z
    .string()
    .describe(
      "Svaret i rå form inklusive math/LaTeX. Tom sträng om inget svar finns",
    ),
});

export const problemPageAgent = new Agent(components.agent, {
  name: "ProblemPageParser",
  languageModel: openrouter("openai/gpt-4o-mini"),
  instructions: `Du extraherar ett enda matematikproblem från OCR/parser-text.
Returnera:
- rawProblemNumber: problemnumret utan prefix "P" om möjligt (t.ex. "1.1")
- rawText: hela problemtexten rå, med LaTeX/ekvationer bevarade; inkludera inte svaret
- rawAnswer: tillhörande svar rått; tom sträng om saknas

Bevara ALL matematik och ALLA (a)/(b)/(c)-markörer i ordning.
Slå ihop radbrytningar som hör till samma problem, men hitta inte på text.
Rätta bara uppenbart OCR-skräp i löptext (t.ex. "Ar ¨"→"Är"); ändra inte matematiken.
Översätt inte. Behåll originalspråk (ofta svenska).`,
});

/**
 * Parse one pre-split problem+answer chunk into structured raw fields.
 */
export const parseProblemChunk = internalAction({
  args: {
    userId: v.id("users"),
    problemNumber: v.string(),
    problemText: v.string(),
    answerText: v.string(),
  },
  returns: parsedProblemValidator,
  handler: async (ctx, args) => {
    const result = await problemPageAgent.generateObject(
      ctx,
      { userId: args.userId },
      {
        schema: parsedProblemSchema,
        schemaName: "ParsedMathProblem",
        schemaDescription:
          "Ett matematikproblem med rå text, rått svar och problemnummer",
        prompt: `Extrahera problemet från denna chunk.

Förväntat problemnummer: ${args.problemNumber}

--- PROBLEMTEXT ---
${args.problemText}

--- SVARSTEXT (kan vara tom) ---
${args.answerText.length > 0 ? args.answerText : "(inget svar i källan)"}
`,
      },
      {
        storageOptions: { saveMessages: "none" },
        contextOptions: { recentMessages: 0 },
      },
    );

    const object = result.object;
    return {
      rawProblemNumber:
        object.rawProblemNumber.trim().length > 0
          ? object.rawProblemNumber.trim()
          : args.problemNumber,
      rawText: object.rawText.trim(),
      rawAnswer: object.rawAnswer.trim(),
    };
  },
});
