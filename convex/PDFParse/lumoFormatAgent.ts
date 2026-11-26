import { Agent } from "@convex-dev/agent";
import { Output } from "ai";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  LUMO_FORMAT_INSTRUCTIONS,
  buildFormatDetectPrompt,
} from "../lib/prompts";
import {
  aiTelemetry,
  forceFlushPosthogTraces,
} from "../lib/posthogOtel";
import { openrouter } from "../agents/openrouter";
import {
  normalizeProblemNumberFormat,
  problemNumberFormatSchema,
  problemNumberFormatValidator,
  type ProblemNumberFormat,
} from "./problemNumberFormat";

export const lumoFormatAgent = new Agent(components.agent, {
  name: "LumoProblemFormatDetector",
  languageModel: openrouter("openai/gpt-4.1-mini"),
  instructions: LUMO_FORMAT_INSTRUCTIONS,
});

const leadSampleValidator = v.object({
  pageIdx: v.number(),
  blockType: v.string(),
  lead: v.string(),
});

function formatLeadsForPrompt(
  leads: Array<{ pageIdx: number; blockType: string; lead: string }>,
): string {
  return leads
    .map(
      (lead, index) =>
        `${index + 1}. [p${lead.pageIdx} ${lead.blockType}] ${lead.lead}`,
    )
    .join("\n");
}

/**
 * Detect the dominant problem-number format from sampled MinerU block leads.
 * Pass leads only (not full middle_json) to keep action args small.
 */
export const detectProblemNumberFormat = internalAction({
  args: {
    userId: v.id("users"),
    leads: v.array(leadSampleValidator),
  },
  returns: problemNumberFormatValidator,
  handler: async (ctx, args): Promise<ProblemNumberFormat> => {
    if (args.leads.length === 0) {
      return normalizeProblemNumberFormat(null);
    }

    const result = await lumoFormatAgent.generateText(
      ctx,
      { userId: args.userId },
      {
        output: Output.object({
          schema: problemNumberFormatSchema,
          name: "ProblemNumberFormat",
          description:
            "Structured problem-number pattern for one PDF: prefix, segmentCount, terminator, pgaFormat, titleBlocks, answerSectionHeading, allowNumberRestart, examples",
        }),
        prompt: buildFormatDetectPrompt(formatLeadsForPrompt(args.leads)),
        experimental_telemetry: aiTelemetry({
          functionId: "pdf-format",
          distinctId: args.userId,
        }),
      },
      {
        storageOptions: { saveMessages: "none" },
        contextOptions: { recentMessages: 0 },
      },
    );

    await forceFlushPosthogTraces();
    return normalizeProblemNumberFormat(result.output);
  },
});
