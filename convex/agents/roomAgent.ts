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
  normalizeLumoDocument,
  serializeWorkedSolutionForPrompt,
  solveModeHint,
  stringifyLumoDocument,
  workedSolutionSchema,
} from "../lib/lumoContent";
import type { ChatMode, LumoDocument, WorkedSolution } from "../lib/lumoContent";
import { openrouter } from "./openrouter";

/** Pass 1: solve math only. */
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
    return [
      `Uppgift ${problem.problemNumber}`,
      `Fråga: ${problem.questionText}`,
      `Facit från boken: ${answer}`,
      "Krav: finalLatex MÅSTE matcha facit. Bygg korrekta mellansteg dit (tecken/parenteser).",
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

function parseFormatDocument(formatText: string): LumoDocument {
  try {
    const json: unknown = JSON.parse(formatText);
    const azure = lumoDocumentAzureSchema.safeParse(json);
    if (azure.success) return normalizeLumoDocument(azure.data);
  } catch {
    // fall through
  }
  return {
    version: 1,
    parts: [{ type: "text", content: formatText }],
  };
}

/** Append pass-1 output as one text part on the format document (not a second envelope). */
function withWorkedSolutionTextPart(
  formatDoc: LumoDocument,
  solution: WorkedSolution,
): LumoDocument {
  return {
    version: 1,
    parts: [
      ...formatDoc.parts,
      {
        type: "text",
        content: JSON.stringify(solution, null, 2),
      },
    ],
  };
}

export const generateResponse = internalAction({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    mode: v.optional(chatModeValidator),
    roomId: v.optional(v.id("rooms")),
    problemIds: v.optional(v.array(v.id("problems"))),
    debugSolve: v.optional(v.boolean()),
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

    // Pass 1 — solve (depth from mode; facit when present).
    const solved = await roomSolveAgent.generateObject(
      ctx,
      { threadId: args.threadId },
      {
        promptMessageId: args.promptMessageId,
        schema: workedSolutionSchema,
        schemaName: "WorkedSolution",
        schemaDescription:
          "Korrekt arbetad lösning: subproblems med math-only latex-steg + finalLatex (matcha facit). Ingen svenska i latex.",
        system: `${LUMO_SOLVE_INSTRUCTIONS}

${solveModeHint(mode)}${problemContext}

--- VERIFIERA TYST INNAN DU SVARAR ---
□ Du svarar på det studenten frågade (rätt deluppgifter)
□ finalLatex matchar facit när facit finns
□ Varje steps[].latex är ren matematik (ingen svenska, inget \\\\text)
□ note är ren prosa eller "" (ingen TeX)
□ Minus framför parentes: tecken bytt exakt en gång per term
□ Kedjan steps → finalLatex är algebraiskt ekvivalent
`,
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
            "Lumo-svar: text=svenska (aldrig TeX), latex=matte (aldrig svenska/\\\\text). quickReplies/subproblem/case. Oanvända fält = \"\" / [].",
        }),
        system: `${LUMO_FORMAT_INSTRUCTIONS}

${formatModeHint(mode)}

════════════════════════════════════════
INTERNT ARBETAD LÖSNING (källa till sanning)
════════════════════════════════════════
Kopiera dessa uttryck. OMRÄKNA INTE.

${workedBlock}

--- VERIFIERA TYST INNAN DU SVARAR ---
□ type=text: ingen \\\\ / matematik  |  type=latex: ingen svenska / \\\\text
□ Prosa runt matte är splittrad: text / latex / text
□ Matte kommer från den arbetade lösningen ovan
□ Avsluta ofta med quickReplies (2–4 vägval)
□ Chattläget följs (normal/thoughtProcess)
`,
      },
      {
        saveStreamDeltas: { chunking: "word", throttleMs: 100 },
      },
    );

    await result.consumeStream();

    if (args.debugSolve === true) {
      const formatText = await result.text;
      const combined = withWorkedSolutionTextPart(
        parseFormatDocument(formatText),
        workedSolution,
      );
      const combinedText = stringifyLumoDocument(combined);

      const savedAssistant = [...(result.savedMessages ?? [])]
        .reverse()
        .find((message) => message.message?.role === "assistant");

      if (savedAssistant !== undefined) {
        await roomAgent.updateMessage(ctx, {
          messageId: savedAssistant._id,
          patch: {
            message: { role: "assistant", content: combinedText },
            status: "success",
          },
        });
      }
    }

    return null;
  },
});
