import { Agent } from "@convex-dev/agent";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { components } from "../_generated/api";
import { env } from "../_generated/server";

const openrouter = createOpenRouter(
  env.OPENROUTER_API_KEY ? { apiKey: env.OPENROUTER_API_KEY } : undefined,
);

export const problemListSchema = z.object({
  problems: z.array(
    z.object({
      number: z
        .string()
        .describe(
          "Top-level problem number only, e.g. \"3\". Never include lettered parts like \"3a\".",
        ),
      question: z
        .string()
        .describe(
          "Full question text including any stem and lettered subparts (a, b, …).",
        ),
      // Required (nullable) so Azure/OpenAI strict JSON schema accepts the shape.
      answer: z
        .string()
        .nullable()
        .describe(
          "Answer(s) for this problem if present in the PDF (including a/b answers). Null if no answer is available.",
        ),
    }),
  ),
});

export type ProblemListResult = z.infer<typeof problemListSchema>;

export const problemListAgent = new Agent(components.agent, {
  name: "ProblemListExtractor",
  languageModel: openrouter("openai/gpt-4o", {
    plugins: [
      {
        id: "file-parser",
        pdf: { engine: "native" },
      },
    ],
  }),
  instructions: `Du extraherar matematikuppgifter från ett PDF-utdrag (uppgifter och eventuella facitsidor).

Regler:
- Returnera EN post per topnivå-nummer (1, 2, 3, …).
- Om uppgift 3 har delarna 3a och 3b: number ska vara "3" och question ska innehålla både a och b (samt eventuell gemensam ingress).
- Skapa ALDRIG separata poster för 3a/3b.
- Om facit finns, koppla rätt svar till rätt topnivå-uppgift (a/b-svar i samma answer-sträng).
- Behåll matematiska uttryck så troget som möjligt i texten.
- Ignorera sidhuvuden, sidfot, instruktioner som inte är uppgifter.`,
});
