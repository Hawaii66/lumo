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

const LUMO_PROBLEM_INSTRUCTIONS = `Du konverterar ett rått matematikproblem (från PDF/OCR-chunk) till Lumo-språket i ETT steg.
Chunkarna är redan uppdelade per problemnummer — hitta inte på text, men normalisera uppenbart OCR-skräp.

════════════════════════════════════════
PART-INNEHÅLL (du bestämmer gränserna)
════════════════════════════════════════
Varje part är ANTINGEN bara svenska ELLER bara matematik — aldrig båda.

type=text:
- Endast svensk (eller annan naturlig) prosa.
- Exempel: "Förenkla", "där", "för alla", "är lösningar", "lösning saknas", "Ja", "Nej".
- Får INTE innehålla TeX (\\\\frac, \\\\neq, ^{}, _{}, \\mathrm, …) eller rena matematiska uttryck.

type=latex:
- Endast matematik som LaTeX (utan $ eller $$).
- Exempel: "a^{2}+b-c", "\\\\frac{1}{2}", "x\\\\neq 0", "a=2", "16", "P_{1}", "\\\\alpha_{1}".
- Indexerade symboler MÅSTE vara latex: P_1 / P1 / "P _ { 1 }" → "P_{1}" (aldrig kvar som text "P_1").
- Får INTE innehålla svenska ord ("där", "alla", "är", "lösningar", "och", …).
- Använd INTE \\\\text{svenska} — lägg svenskan i en egen text-part bredvid.

Interfoliering:
- Splitta gärna en mening i många delar: text, latex, text, latex, …
- Exempel: text "Undersök om punkterna", latex "P_{1}", text ",", latex "P_{2}", text "och", latex "P_{3}", text "alla ligger …"
- Du avgör var gränsen går mellan prosa och matte. Var konsekvent och finfördelad hellre än att klumpa ihop.

Returnera ETT JSON-objekt:
{
  "problemNumber": "1.1",
  "question": { "version": 1, "parts": [ ... ] },
  "answer": { "version": 1, "parts": [ ... ] }
}

Tillåtna part-typer (INGA andra). Varje part MÅSTE ha type, content, display, label och caption:
- text: { "type": "text", "content": "...", "display": "inline", "label": "", "caption": "" }
- latex: { "type": "latex", "content": "...", "display": "inline"|"block", "label": "", "caption": "" }
- subproblem: { "type": "subproblem", "content": "", "display": "inline", "label": "a", "caption": "" } — skild UPPGIFT
- case: { "type": "case", "content": "", "display": "inline", "label": "1", "caption": "" } — villkorsFALL / else-gren (ofta i svar)

caption (valfritt värdenamn inom en task):
- Använd på text/latex när källan namnger flera resultat under SAMMA uppgift, t.ex. caption "Mgn" / "summa".
- Tom sträng när värdet saknar namn.
- ALDRIG task-bokstav eller fallnummer i caption.
- label: task-bokstav på subproblem; valfritt "1"/"2"/… (eller "") på case; annars "".

OCR-städning (lätt):
- Bevara ALL matematik och ALLA (a)/(b)/(c)-markörer.
- Rätta bara uppenbart skräp i löptext (t.ex. "Ar ¨"→"Är", "där" ur \\\\mathrm{…}).
- Ändra inte matematiken. Översätt inte.

════════════════════════════════════════
SUBPROBLEM = SKILD UPPGIFT / TASK
════════════════════════════════════════
Skapa subproblem ENDAST när källan har flera skilda uppgifter (olika saker studenten ska göra).
En task = en del att lösa för sig (ofta märkt (a), (b), … eller tydligt parallella uttryck som var för sig ska beräknas).

Skapa subproblem när:
1) Explicit task-märkning: fristående (a), (b), a), b) före respektive del.
2) Tydligt parallella tasks utan bokstav: samma instruktion gäller flera fristående uttryck som ska behandlas var för sig
   (t.ex. "Skriv bråken X och Y i enklast form" → två tasks a=X, b=Y).
   Avgör utifrån BETYDELSE (två uppgifter), inte utifrån att ordet "och"/"respektive" förekommer.

Skapa INTE subproblem när:
- Ett enda uttryck med flera termer (+, −, ·, /, =) — EN latex-part.
- Flera lösningar/värden till SAMMA task: "x=0 och x=-2" → flera latex under samma subproblem/case.
- Namngivna delfält (Mgn, summa) — caption, inte subproblem.
- Parenteser i matten: "(a-2b+3c)" är latex, inte label "a".
- Ordproblem / en narrativ fråga — ingen subproblem.
- Fallanalys i SVARET (olika villkor → olika resultat) — använd type=case, INTE subproblem.
- Osäkerhet — hellre INGEN subproblem än påhittade a/b/c.

KRITISKT — subproblem och case får ALDRIG stå ensamma:
Efter varje subproblem/case MÅSTE följa minst en text- eller latex-part.

════════════════════════════════════════
CASE = VILLKORSFALL / ELSE-GREN (inte task)
════════════════════════════════════════
Använd type=case när SVARET (eller frågan) delar upp sig i alternativa fall beroende på parametrar
(t.ex. "om a=2 och b=1/2 …; om a=2 och b≠1/2 …; annars …").

- case ≠ subproblem. Frågan har ofta INGA (a)/(b) — då ska svaret heller inte få subproblem a/b/c.
- Efter varje case: villkor + resultat som text/latex-parts.
- label på case: valfritt "1","2",… eller "".
- Flera värden inom SAMMA fall: flera latex under samma case (inte ny case).

════════════════════════════════════════
FLERA SVAR UNDER EN TASK ELLER ETT FALL
════════════════════════════════════════
- Namngivna resultat: caption + latex/text (Mgn, summa).
- Flera onamngivna lösningar: flera latex utan ny subproblem/case.

Regler:
1. problemNumber = basnummer UTAN "P" och UTAN bokstav (t.ex. "1.1", inte "P 1.1" / "1.1a").
2. Gemensam ingress som text FÖRE första subproblem; upprepa den inte per task.
3. question och answer ska ha samma task-labels i samma ordning; varje label måste ha innehåll efter sig.
4. En enda task: ingen subproblem-part.
5. SVAR — tappa ALDRIG bort facit:
   - Om --- RÅTT SVAR --- har innehåll: konvertera DET till answer.parts (latex/text). Hitta ALDRIG på "Lösning saknas".
   - Korta svar: tal/uttryck → latex ("0", "16"); svenska ord → text ("Ja", "Nej").
   - Tom answer.parts ENDAST när rått svar är tomt / "(inget svar i källan)".
   - Texten "Lösning saknas" ENDAST om källan själv säger det för en viss task (t.ex. "(c) Lösning saknas"),
     och då bara under den tasken — aldrig som ersättning för hela svaret.
6. Rätta inte matematiken. Behåll originalspråk. Normalisera uppenbart OCR-skräp.
7. Använd ALDRIG fillBlank, solution eller quickReplies.
8. Växla fritt text/latex. Indexerad matte (P_{1}, α_{1}) alltid latex — aldrig inne i text.
9. Behåll HELA frågetexten. Hitta inte på tasks från givna data i berättelser.
10. Mid-mening tasks: "divideras med (a) x-1 (b) x+2 (c) x^2-x"
    → text "divideras med", subproblem a, latex "x-1", …
11. Fallanalys i facit utan (a)/(b) i frågan → type=case per gren, ALDRIG subproblem a/b/c.

Exempel 1 — explicit tasks (a)/(b):
Rå fråga: "Förenkla (a) a^2+b-c där c=1-a+2b (b) 3x^2-2x+1-y där y=..."
Rått svar: "(a) a^2+a-b-1 (b) 4x^2-7x+6"
→ question: text "Förenkla", subproblem a, latex…, text "där", latex…, subproblem b, …
→ answer: subproblem a, latex "a^{2}+a-b-1", subproblem b, latex "4x^{2}-7x+6"

Exempel 2 — parallella tasks (betydelse, inte ordet "och"):
Rå fråga: "Skriv bråken X och Y i enklast möjliga form."
Rått svar: "X' respektive Y'"
→ två tasks a=X, b=Y
→ answer: subproblem a + latex X', subproblem b + latex Y'

Exempel 3 — FLERA SVAR, EN task (INTE ny subproblem):
Rått svar: "(b) x = 0 och x = -2"
→ subproblem b, latex "x=0", latex "x=-2"

Exempel 4 — namngivna resultat med caption:
Rått svar: "(a) Mgn = 420 summa = 2/15"
→ subproblem a, latex caption="Mgn" "420", latex caption="summa" "\\\\frac{2}{15}"

Exempel 5 — ETT uttryck (INTE tasks):
"Skriv uttrycket -1/(x-2y)+… på enkel form" → text + EN latex + text. Inga subproblem.

Exempel 6 — parentes i matten ≠ task:
"Utveckla (a-2b+3c)^2 …" → latex "(a-2b+3c)^{2}", INGEN subproblem "a".

Exempel 7 — ordproblem:
En narrativ fråga → en text-part, inga subproblem.

Exempel 8 — faktiskt facit (FÅR INTE bli "Lösning saknas"):
Rått svar: "0" → latex "0"; "16" → latex "16"; "Ja" → text "Ja"
Rått svar: "(a) x=1 (b) ingen lösning (c) x=-1, x=3"
→ subproblem a + latex "x=1"; subproblem b + text "ingen lösning"; subproblem c + latex…
FEL: answer.parts = [text "Lösning saknas"] när rått svar har matematik/text.

Exempel 9 — fallanalys med type=case (INTE subproblem):
Frågan har INGA (a)/(b). Rått svar: "a=2, b=1/2 : alla x≠1/2 är lösningar; a=2, b≠1/2; lösning saknas; …"
→ case label "1",
   latex "a=2, b=\\\\frac{1}{2}", text "alla", latex "x\\\\neq\\\\frac{1}{2}", text "är lösningar;",
   case label "2",
   latex "a=2, b\\\\neq\\\\frac{1}{2}", text "lösning saknas;",
   case label "3", …
FEL: subproblem a/b/c för dessa grenar.
FEL: svenska + TeX i samma part.

Exempel 10 — indexerade punkter måste vara latex:
Rå fråga: "Undersök om punkterna P _ { 1 } , P _ { 2 } och P _ { 3 } alla ligger …"
→ text "Undersök om punkterna", latex "P_{1}", text ",", latex "P_{2}", text "och", latex "P_{3}", text "alla ligger …"
FEL: en text-part "… punkterna P_1, P_2 och P_3 …"

Exempel 11 — divisor-tasks mid-mening:
Rå fråga: "… divideras med (a) x-1 (b) x+2 (c) x^{2}-x."
→ text "divideras med", subproblem a, latex "x-1", subproblem b, latex "x+2", subproblem c, latex "x^{2}-x"
FEL: text "(b)" utan divisor-latex.`;

export const lumoProblemAgent = new Agent(components.agent, {
  name: "LumoProblemConverter",
  languageModel: openrouter("openai/gpt-4o-mini"),
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
        prompt: `Konvertera denna OCR-chunk till Lumo-språket (ett steg: städa lätt + strukturera).

Viktigt:
- Om rått svar har innehåll: answer.parts MÅSTE spegla det. Skriv ALDRIG "Lösning saknas" som ersättning.
- "Lösning saknas" endast när källan säger det för en specifik task.
- Varje part: ANTINGEN bara svenska (text) ELLER bara matematik (latex). Blanda aldrig.
- Indexerad matte (P_{1}, α_{1}, …) alltid latex — aldrig "P_1" inne i text.
- Använd inte \\\\text{…} för svenska inne i latex.
- subproblem = skild UPPGIFT (a)/(b). case = villkorsfall/else i svar — INTE samma sak.
- Om frågan saknar (a)/(b): använd INTE subproblem i svaret för fallgrenar — använd case.
- Flera lösningar till samma task/fall → flera latex under samma subproblem/case.
- Namngivna delfält (Mgn, summa) → caption, inte ny subproblem/case.
- Efter varje subproblem/case MÅSTE latex eller text komma direkt efter.
- Mid-mening (a) expr (b) expr: varje expr → latex under sin task.
- "(a-2b+3c)" är latex, INTE subproblem "a".
- problemNumber utan "P". Behåll HELA frågan. Vid tveksamhet: ingen subproblem.

Problemnummer (förslag): ${suggestedNumber}

--- RÅ FRÅGA ---
${problemText}

--- RÅTT SVAR (kan vara tomt) ---
${answerText.length > 0 ? answerText : "(inget svar i källan)"}
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
