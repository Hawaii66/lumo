import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { components } from "../_generated/api";
import { env } from "../_generated/server";

const openrouter = createOpenRouter(
  env.OPENROUTER_API_KEY ? { apiKey: env.OPENROUTER_API_KEY } : undefined,
);

const segmentSchema = z.object({
  type: z.enum(["text", "latex", "subproblem"]),
  content: z.string(),
});

export const problemFormatSchema = z.object({
  segments: z
    .array(segmentSchema)
    .describe(
      "Question as alternating text/latex segments. Use type subproblem with content \"a\", \"b\", … before each lettered part. Omit subproblem if there are no lettered parts.",
    ),
  // Required (nullable) so Azure/OpenAI strict JSON schema accepts the shape.
  answerSegments: z
    .array(segmentSchema)
    .nullable()
    .describe(
      "Answer segments with the same subproblem markers when answers exist. Null if there is no answer.",
    ),
});

export type ProblemFormatResult = z.infer<typeof problemFormatSchema>;

export const problemFormatAgent = new Agent(components.agent, {
  name: "ProblemFormatter",
  languageModel: openrouter("openai/gpt-4o"),
  instructions: `Du konverterar en matematikuppgift till en segmentarray.

Segmenttyper:
- text: vanlig prosa (utan matematik)
- latex: matematiskt uttryck i LaTeX (utan omgivande $…$)
- subproblem: endast delbokstav, t.ex. "a" eller "b" — placeras före den delens innehåll

Regler:
- Dela upp så att matematik blir latex och övrigt blir text.
- För 3a/3b: använd subproblem-segment; skapa inte separata uppgifter.
- Om det finns en gemensam ingress före a/b, lägg den som text/latex före första subproblem.
- Svara endast med strukturerad data enligt schemat.`,
});
