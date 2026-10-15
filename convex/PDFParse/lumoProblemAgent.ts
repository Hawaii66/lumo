import { Agent } from "@convex-dev/agent";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { internalAction } from "../_generated/server";
import {
  lumoParsedProblemAzureSchema,
  lumoParsedProblemValidator,
  normalizeLumoParsedProblem,
} from "../lib/lumoContent";
import { openrouter } from "../agents/openrouter";
import { parsedProblemValidator } from "./problemPageAgent";

const LUMO_PROBLEM_INSTRUCTIONS = `Du konverterar ett rått matematikproblem (från PDF/OCR) till Lumo-språket.

Returnera ETT JSON-objekt:
{
  "problemNumber": "1.1",
  "question": { "version": 1, "parts": [ ... ] },
  "answer": { "version": 1, "parts": [ ... ] }
}

Tillåtna part-typer (INGA andra). Varje part MÅSTE ha type, content, display och label:
- text: { "type": "text", "content": "...", "display": "inline", "label": "" }
- latex: { "type": "latex", "content": "...", "display": "inline"|"block", "label": "" } — BARA LaTeX, utan $ eller $$
- subproblem: { "type": "subproblem", "content": "", "display": "inline", "label": "a" }

KRITISKT — subproblem får ALDRIG stå ensamma:
Efter varje { "type": "subproblem", "label": "a" } MÅSTE följa minst en text- eller latex-part med själva frågan/svaret för den deluppgiften.
FEL (saknar innehåll):  [subproblem a, subproblem b]
RÄTT:                   [subproblem a, latex/text..., subproblem b, latex/text...]

När ska du skapa deluppgifter (a, b, c, …)?
A) Explicit märkning: (a), (b), a), b) i källan.
B) Implicit lista med "och" / komma mellan parallella uttryck som ska lösas var för sig,
   t.ex. "Skriv bråken X och Y i enklast form" → subproblem a=X, b=Y.
C) Svar med "respektive" / "resp." mellan parallella resultat → samma delning som frågan,
   t.ex. "3/26 respektive 96/13" → subproblem a + latex, subproblem b + latex.
   Ta BORT ordet "respektive"/"och" från parts — det ersätts av subproblem-etiketter.

Regler:
1. problemNumber är basnumret UTAN bokstav (t.ex. "1.1", inte "1.1a").
2. Gemensam ingress (t.ex. "Förenkla", "Skriv bråken … i enklast möjliga form.") kommer som text FÖRE första subproblem; upprepa den inte i varje deluppgift.
3. question.parts och answer.parts MÅSTE ha samma subproblem-labels i samma ordning, och varje label ska ha innehåll efter sig.
4. En enda uppgift utan parallella delar: ingen subproblem-part.
5. Tom answer.parts endast om svar saknas i källan.
6. Rätta inte matematiken. Behåll originalspråk. Normalisera uppenbart OCR-skräp i LaTeX.
7. Använd ALDRIG fillBlank, solution eller quickReplies.

Exempel 1 — explicit (a)/(b):
Rå fråga: "Förenkla (a) a^2+b-c där c=1-a+2b (b) 3x^2-2x+1-y där y=..."
Rått svar: "(a) a^2+a-b-1 (b) 4x^2-7x+6"
→ question.parts:
  text "Förenkla",
  subproblem "a", latex "a^{2}+b-c", text "där", latex "c=1-a+2b",
  subproblem "b", latex "...", text "där", latex "..."
→ answer.parts:
  subproblem "a", latex "a^{2}+a-b-1",
  subproblem "b", latex "4x^{2}-7x+6"

Exempel 2 — "och" / "respektive":
Rå fråga: "Skriv bråken \\\\frac{\\\\frac{12}{13}}{8} och \\\\frac{12}{\\\\frac{13}{8}} i enklast möjliga form."
Rått svar: "\\\\frac{3}{26} respektive \\\\frac{96}{13}"
→ question.parts:
  text "Skriv bråken",
  subproblem "a", latex "\\\\frac{\\\\frac{12}{13}}{8}",
  subproblem "b", latex "\\\\frac{12}{\\\\frac{13}{8}}",
  text "i enklast möjliga form."
→ answer.parts:
  subproblem "a", latex "\\\\frac{3}{26}",
  subproblem "b", latex "\\\\frac{96}{13}"`;

export const lumoProblemAgent = new Agent(components.agent, {
  name: "LumoProblemConverter",
  languageModel: openrouter("openai/gpt-4o-mini"),
  instructions: LUMO_PROBLEM_INSTRUCTIONS,
});

/**
 * Convert one raw parsed problem into Lumo-language question/answer documents.
 */
export const convertRawProblem = internalAction({
  args: {
    userId: v.id("users"),
    raw: parsedProblemValidator,
  },
  returns: lumoParsedProblemValidator,
  handler: async (ctx, args) => {
    const { rawProblemNumber, rawText, rawAnswer } = args.raw;

    const result = await lumoProblemAgent.generateObject(
      ctx,
      { userId: args.userId },
      {
        // Flat schema — Azure rejects JSON Schema `oneOf` from Zod unions.
        schema: lumoParsedProblemAzureSchema,
        schemaName: "LumoParsedProblem",
        schemaDescription:
          "Lumo-problem: efter varje subproblem-etikett MÅSTE text/latex-innehåll följa; splitta och/respektive till a,b,…",
        prompt: `Konvertera detta råa problem till Lumo-språket.

Viktigt:
- Efter varje subproblem-label ska frågans/svarets latex eller text komma DIREKT efter — aldrig bara etiketter.
- Splitta parallella uttryck kopplade med "och" till subproblem a, b, …
- Splitta svar kopplade med "respektive"/"resp." på samma sätt; ta bort själva ordet.

Problemnummer (förslag): ${rawProblemNumber}

--- RÅ FRÅGA ---
${rawText}

--- RÅTT SVAR (kan vara tomt) ---
${rawAnswer.length > 0 ? rawAnswer : "(inget svar i källan)"}
`,
      },
      {
        storageOptions: { saveMessages: "none" },
        contextOptions: { recentMessages: 0 },
      },
    );

    const normalized = normalizeLumoParsedProblem(result.object, rawText);
    return {
      ...normalized,
      problemNumber:
        normalized.problemNumber.length > 0
          ? normalized.problemNumber
          : rawProblemNumber,
    };
  },
});
