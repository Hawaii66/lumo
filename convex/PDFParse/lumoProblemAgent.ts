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

När ska du skapa deluppgifter (a, b, c, …)? ENDAST om källan tydligt har dem:
A) Explicit märkning: fristående etiketter (a), (b), a), b) i källan — bokstav ensam i parentes/följt av ).
B) Implicit lista: samma instruktion gäller flera matematiska uttryck kopplade med "och",
   t.ex. "Skriv bråken X och Y i enklast form" → subproblem a=X, b=Y.
   Gäller BARA när X och Y själva är uttryck som ska beräknas/förenklas var för sig.
C) Svar med "respektive" / "resp." mellan parallella resultat → samma delning som frågan,
   t.ex. "3/26 respektive 96/13" → subproblem a + latex, subproblem b + latex.
   Ta BORT ordet "respektive"/"och" från parts — det ersätts av subproblem-etiketter.

När ska du INTE skapa deluppgifter?
- Ett enda uttryck med flera termer kopplade med matematiska operatorer (+, −, ·, /, =, osv.)
  är EN uppgift — behåll allt i EN latex-part. Splitta ALDRIG på +/− mellan bråk/termer.
- "Skriv uttrycket … på enkel form" / "Förenkla …" / "Utveckla …" med ETT uttryck → ingen subproblem.
- Parenteser i matematiken är INTE deluppgifter: "(a - 2b + 3c)" / "(a+b)^2" / "(x)" är latex, inte label "a".
  En deluppgiftsetikett är BARA bokstaven (t.ex. "(a)" eller "a)") — aldrig "(a - …)" eller "(a+…)".
- Textuppgifter / ordproblem med EN fråga → ingen subproblem. Givna data i berättelsen
  ("25 klarade I, 18 II och 3 ingen") är INTE deluppgifter — "och"/komma listar fakta, inte uppgifter.
- Hitta ALDRIG på deluppgifter, omformuleringar eller extra frågor som inte finns i källan.

Regler:
1. problemNumber är basnumret UTAN bokstav (t.ex. "1.1", inte "1.1a").
2. Gemensam ingress (t.ex. "Förenkla", "Skriv bråken … i enklast möjliga form.") kommer som text FÖRE första subproblem; upprepa den inte i varje deluppgift.
3. question.parts och answer.parts MÅSTE ha samma subproblem-labels i samma ordning, och varje label ska ha innehåll efter sig.
4. En enda uppgift utan parallella delar: ingen subproblem-part.
5. Tom answer.parts endast om svar saknas i källan.
6. Rätta inte matematiken. Behåll originalspråk. Normalisera uppenbart OCR-skräp i LaTeX.
7. Använd ALDRIG fillBlank, solution eller quickReplies.
8. Tappa ALDRIG bort matematiska uttryck från frågan — varje ekvation/formel i råtexten MÅSTE bli en latex-part.
9. Behåll HELA frågetexten (bakgrund + fråga). Klipp inte bort setup/givna data. Lägg inte till frågor som saknas i källan.
10. Vid osäkerhet: hellre EN text/latex-part utan subproblem än påhittade a/b/c.

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
  subproblem "b", latex "\\\\frac{96}{13}"

Exempel 3 — ETT uttryck med flera termer (INTE deluppgifter):
Rå fråga: "Skriv uttrycket -\\\\frac{1}{x-2y} + \\\\frac{x-y}{x^{2}-4xy+4y^{2}} - \\\\frac{y}{(x-2y)^{2}} på så enkel form som möjligt."
→ question.parts (INGA subproblem):
  text "Skriv uttrycket",
  latex "-\\\\frac{1}{x-2y}+\\\\frac{x-y}{x^{2}-4xy+4y^{2}}-\\\\frac{y}{(x-2y)^{2}}",
  text "på så enkel form som möjligt."
FEL: att lägga subproblem a/b/c runt varje bråk — +/− hör till uttrycket.

Exempel 4 — parenteser i matten ≠ deluppgift; tappa inte latex:
Rå fråga: "Utveckla (a - 2b + 3c)^{2} till en summa av produkter."
Rått svar: "a^{2}-4ab+6ac+4b^{2}-12bc+9c^{2}"
→ question.parts (INGA subproblem):
  text "Utveckla",
  latex "(a-2b+3c)^{2}",
  text "till en summa av produkter."
→ answer.parts:
  latex "a^{2}-4ab+6ac+4b^{2}-12bc+9c^{2}"
FEL: subproblem "a" + borttappad latex — "(a - 2b + 3c)" är matematik, inte etikett (a).

Exempel 5 — textuppgift / ordproblem (behåll hela texten, INGA påhittade deluppgifter):
Rå fråga: "30 studenter läste en kurs där det krävdes godkänt på två deltentamina för att få godkänt på hela kursen. 25 klarade tentamen I, 18 tentamen II och 3 ingen tentamen. Hur många var godkända på kursen efter dessa tentamina?"
Rått svar: "Så, antalet godkända studenter blev 16."
→ question.parts (INGA subproblem — en enda text-part med HELA frågan):
  text "30 studenter läste en kurs där det krävdes godkänt på två deltentamina för att få godkänt på hela kursen. 25 klarade tentamen I, 18 tentamen II och 3 ingen tentamen. Hur många var godkända på kursen efter dessa tentamina?"
→ answer.parts:
  text "Så, antalet godkända studenter blev 16."
  (eller latex "16" om svaret bara är talet)
FEL: att klippa bort bakgrunden och hitta på a/b/c om "antalet som klarade I/II/ingen" — det är givna data, inte frågor.`;

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
          "Lumo-problem: behåll hela frågan; subproblem endast vid tydliga (a)(b)/och-uttryck/respektive — aldrig påhittade a/b/c",
        prompt: `Konvertera detta råa problem till Lumo-språket.

Viktigt:
- Efter varje subproblem-label ska frågans/svarets latex eller text komma DIREKT efter — aldrig bara etiketter.
- Splitta parallella matematiska uttryck kopplade med "och" till subproblem a, b, … (endast då).
- Splitta svar kopplade med "respektive"/"resp." på samma sätt; ta bort själva ordet.
- Splitta INTE ett enda matematiskt uttryck på +/− mellan termer/bråk — det är EN latex-part utan subproblem.
- "(a - 2b + 3c)" / "(a+b)^2" är latex, INTE subproblem "a". Deluppgift = fristående (a)/(b) endast.
- Behåll ALLA ekvationer från rå frågan som latex-parts — tappa aldrig bort dem.
- Behåll HELA frågetexten (setup + fråga). Hitta inte på deluppgifter från givna tal i narrativ ("25 …, 18 … och 3 …").
- Vid tveksamhet: ingen subproblem.

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
