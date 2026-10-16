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
import { openrouter } from "../agents/openrouter";

const LUMO_PROBLEM_INSTRUCTIONS = `Du konverterar råa matematikproblem (PDF/OCR) till Lumo-formatet i ETT steg.
Svara med ETT JSON-objekt — ingen prosa utanför JSON.

════════════════════════════════════════
OUTPUT-FORMAT
════════════════════════════════════════
{
  "problemNumber": "1.1",
  "question": { "version": 1, "parts": [ … ] },
  "answer":   { "version": 1, "parts": [ … ] }
}

problemNumber: basnummer UTAN "P" och UTAN bokstav ("1.1", inte "P 1.1" eller "1.1a").

════════════════════════════════════════
PART-TYPER  (alla fem fält krävs: type, content, display, label, caption)
════════════════════════════════════════

type=text
  content : Enbart naturlig svensk/engelsk prosa — INGA backslash (\\\\).
            ✓ "Förenkla", "där", "minsta värde =", "Ja", "Nej", "ingen lösning", "."
            ✗ Allt som innehåller \\\\  (\\\\frac, \\\\sqrt, \\\\neq, \\\\mathrm, \\\\text, …)
            ✗ ^{}, _{}, matematiska symboler, olikheter, bråk
            HARD RULE: Om content innehåller tecknet \\\\ → det FÅR INTE vara type=text.
              Flytta matten till type=latex (splitta text/latex/text vid behov).
  display : "inline"
  label   : ""
  caption : valfritt värdenamn ("Mgn", "summa"); "" annars

type=latex
  content : Enbart LaTeX-matematik (utan $ eller $$).
            ✓ "a^{2}+b-c", "\\\\frac{1}{2}", "x\\\\neq 0", "P_{1}", "\\\\sqrt{3}"
            ✗ Svenska ord som enda innehåll; \\\\text{…}; \\\\mathrm{Nej} o.dyl.
            HARD RULE: Svenska svarord ("Ja", "Nej", "ingen lösning") → type=text,
              ALDRIG latex med \\\\mathrm / \\\\text runt dem.
  display : "inline" | "block"
  label   : ""
  caption : valfritt värdenamn; "" annars

type=subproblem  — markör för en skild uppgift
  content : ""  |  display : "inline"
  label   : uppgiftsbokstav (a, b, c …) — ALDRIG tom
  caption : ""
  ⚠ MÅSTE följas av minst en text- eller latex-part direkt efter.

type=case  — markör för ett villkorsfall ("om …"-gren), ALDRIG en uppgift
  content : ""  |  display : "inline"
  label   : "1", "2", … eller ""
  caption : ""
  ⚠ MÅSTE följas av minst en text- eller latex-part direkt efter.

════════════════════════════════════════
MATEMATIK I PROSA — DELA ALLTID UPP
════════════════════════════════════════
Varje bråk (\\\\frac) och varje matematisk symbol MÅSTE vara type=latex.
Prosa runt matematik → splitta: text / latex / text / latex / …

  RÄTT: text "minsta värde =", latex "\\\\frac{3}{4}", text "antas för", latex "x=-\\\\frac{5}{2}"
  FEL:  text "minsta värde = \\\\frac{3}{4} antas för x = -\\\\frac{5}{2}"

• Tappa ALDRIG vänsterledet: "a < 81/4" → latex "a<\\\\frac{81}{4}"  (inte "<\\\\frac{81}{4}")
• Indexerade symboler (P_{1}, α_{1}) → alltid type=latex, aldrig type=text.

════════════════════════════════════════
SUBPROBLEM — NÄR OCH INTE
════════════════════════════════════════
SKAPA subproblem när:
  1. Explicit märkning: fristående (a), (b) / a), b) före varje del.
  2. Tydligt parallella tasks utan bokstav (avgör utifrån BETYDELSE, inte "och").

SKAPA INTE subproblem när:
  • Uttryck med flera termer → EN latex-part.
  • Flera svar på samma task → flera latex-parts, ingen ny subproblem.
  • Namngivna resultat (Mgn, summa) → använd caption.
  • Parentes i matten: "(a-2b+3c)^2" är EN latex-part, INTE subproblem "a".
  • Narrativ/ordproblem utan tydlig task-uppdelning.
  • Fallanalys i svaret → använd type=case.
  • En enda task → ingen subproblem-part.
  • Vid tveksamhet → hellre ingen subproblem.

════════════════════════════════════════
CASE — VILLKORSFALL, ALDRIG UPPGIFTER
════════════════════════════════════════
Använd type=case ENBART för "om …"-grenar. Aldrig som ersättning för (a)/(b)/(c).

TILLÅTET:
  (1) Inuti en redan öppnad task med villkorsgrenar.
  (2) Frågan saknar subproblem och svaret är en ren fallanalys.

════════════════════════════════════════
SPEGELREGELN  (gör rätt direkt)
════════════════════════════════════════
1. Räkna frågans subproblem-labels (a, b, c …).
2. answer.parts MÅSTE börja med samma labels i samma ordning.
3. case läggs INUTI sin task — inte före eller istället för den.

  RÄTT (fråga har a/b): answer → subproblem a … subproblem b …
  FEL:                  answer → case "1" … case "2" …

════════════════════════════════════════
SVAR — TAPPA ALDRIG FACIT
════════════════════════════════════════
• Rått svar har innehåll → konvertera DET. "Lösning saknas" som ersättning är FÖRBJUDET.
• Tom answer.parts ENDAST när källan är tom eller "(inget svar i källan)".
• "Lösning saknas" får förekomma ENBART om källan själv skriver det för en specifik task.
• Tal/uttryck → latex ("0", "16"); svenska ord → text ("Ja", "Nej").

════════════════════════════════════════
OCR-STÄDNING
════════════════════════════════════════
• Bevara ALL matematik och ALLA (a)/(b)/(c)-markörer.
• Rätta bara uppenbart skräp i löptext ("Ar ¨" → "Är"). Ändra inte matematiken.

════════════════════════════════════════
ÖVRIGA REGLER
════════════════════════════════════════
• Gemensam ingress (text före första subproblem) — upprepa inte per task.
• Behåll HELA frågetexten. Hitta inte på tasks från berättelsedata.
• Använd INTE fillBlank, solution eller quickReplies.

════════════════════════════════════════
EXEMPEL
════════════════════════════════════════

Ex 1 — explicit tasks (a)/(b):
  Fråga: "Förenkla (a) a^2+b-c där c=1-a+2b (b) 3x^2-2x+1-y där y=…"
  Svar:  "(a) a^2+a-b-1 (b) 4x^2-7x+6"
  question: text "Förenkla",
            subproblem a, latex "a^{2}+b-c", text "där", latex "c=1-a+2b",
            subproblem b, latex "3x^{2}-2x+1-y", text "där", latex "y=\\\\ldots"
  answer:   subproblem a, latex "a^{2}+a-b-1",
            subproblem b, latex "4x^{2}-7x+6"

Ex 2 — flera svar, EN task (INTE ny subproblem):
  Svar: "(b) x=0 och x=-2"
  → subproblem b, latex "x=0", latex "x=-2"

Ex 3 — namngivna resultat med caption:
  Svar: "(a) Mgn=420 summa=2/15"
  → subproblem a,
    latex content="420" caption="Mgn",
    latex content="\\\\frac{2}{15}" caption="summa"

Ex 4 — parentes i matten ≠ subproblem:
  "Utveckla (a-2b+3c)^2"
  → latex "(a-2b+3c)^{2}" — INGEN subproblem "a"

Ex 5 — faktiskt facit, ALDRIG "Lösning saknas":
  Svar: "(a) x=1 (b) ingen lösning (c) x=-1, x=3"
  → subproblem a, latex "x=1"
     subproblem b, text "ingen lösning"
     subproblem c, latex "x=-1", latex "x=3"

Ex 6 — fallanalys utan (a)/(b) i frågan → case:
  Svar: "a=2, b=1/2: alla x≠1/2 är lösningar; a=0: …"
  → case "1", latex "a=2", latex "b=\\\\frac{1}{2}", text ", alla",
              latex "x\\\\neq\\\\frac{1}{2}", text "är lösningar"
     case "2", latex "a=0", text ": …"

Ex 7 — svar med (a)/(b) → SUBPROBLEM, aldrig case:
  Svar: "(a) Ingen reell lösning (b) x=-3±√65"
  → subproblem a, text "Ingen reell lösning"
     subproblem b, latex "x=-3\\\\pm\\\\sqrt{65}"

Ex 8 — (a)/(b) med villkorsgrenar under en task:
  Svar: "(a) x=a, x=b   (b) x=a/b, x=b/a om a≠0 och b≠0; x=0 om …; alla reella x om a=b=0"
  → subproblem a, latex "x=a", latex "x=b",
     subproblem b,
       case "1", latex "x=\\\\frac{a}{b}", latex "x=\\\\frac{b}{a}",
                 text "om", latex "a\\\\neq 0", text "och", latex "b\\\\neq 0",
       case "2", latex "x=0", text "om …",
       case "3", text "alla reella tal", text "om", latex "a=b=0"

Ex 9 — prosa med bråk → splitta:
  Svar: "(a) minsta värde = 3/4 antas för x = -5/2. Största värde saknas."
  → subproblem a,
     text "minsta värde =", latex "\\\\frac{3}{4}",
     text "antas för",      latex "x=-\\\\frac{5}{2}",
     text ". Största värde saknas."

Ex 10 — mid-mening tasks:
  "… divideras med (a) x-1 (b) x+2 (c) x^2-x"
  → text "divideras med",
     subproblem a, latex "x-1",
     subproblem b, latex "x+2",
     subproblem c, latex "x^{2}-x"

Ex 11 — indexerade punkter → latex:
  "Undersök om punkterna P_1, P_2 och P_3 alla ligger …"
  → text "Undersök om punkterna",
     latex "P_{1}", text ",", latex "P_{2}", text "och", latex "P_{3}",
     text "alla ligger …"
`;

export const lumoProblemAgent = new Agent(components.agent, {
  name: "LumoProblemConverter",
  languageModel: openrouter("openai/gpt-4.1-nano"),
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
        prompt: `Konvertera denna OCR-chunk till Lumo-formatet.

Problemnummer (förslag): ${suggestedNumber}

--- RÅ FRÅGA ---
${problemText}

--- RÅTT SVAR ---
${answerText.length > 0 ? answerText : "(inget svar i källan)"}

--- VERIFIERA TYST INNAN DU SVARAR ---
□ Spegel: frågans subproblem-labels (a, b, c …) → answer har samma labels, samma ordning
□ Rått svar har innehåll → det är konverterat, aldrig ersatt med "Lösning saknas"
□ Varje \\\\frac är i type=latex, aldrig i type=text
□ Vänsterled bevarat: "a < 81/4" → latex "a<\\\\frac{81}{4}"
□ Indexerade symboler (P_{1}) → type=latex
□ Varje subproblem/case följs direkt av text eller latex
□ type=text: inga matematiska symboler | type=latex: inga svenska ord
`,
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
