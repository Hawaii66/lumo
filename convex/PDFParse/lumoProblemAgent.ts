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
- Exempel: "a^{2}+b-c", "\\\\frac{1}{2}", "x\\\\neq 0", "a=2", "16".
- Får INTE innehålla svenska ord ("där", "alla", "är", "lösningar", …).
- Använd INTE \\\\text{svenska} — lägg svenskan i en egen text-part bredvid.

Interfoliering:
- Splitta gärna en mening i många delar: text, latex, text, latex, …
- Du avgör var gränsen går mellan prosa och matte. Var konsekvent och finfördelad hellre än att klumpa ihop.

Returnera ETT JSON-objekt:
{
  "problemNumber": "1.1",
  "question": { "version": 1, "parts": [ ... ] },
  "answer": { "version": 1, "parts": [ ... ] }
}

Tillåtna part-typer (INGA andra). Varje part MÅSTE ha type, content, display, label och caption:
- text: { "type": "text", "content": "...", "display": "inline", "label": "", "caption": "" } — endast svenska/prosa
- latex: { "type": "latex", "content": "...", "display": "inline"|"block", "label": "", "caption": "" } — BARA LaTeX, utan $ eller $$
- subproblem: { "type": "subproblem", "content": "", "display": "inline", "label": "a", "caption": "" }

caption (valfritt värdenamn inom en task):
- Använd på text/latex när källan namnger flera resultat under SAMMA uppgift, t.ex. caption "Mgn" / "summa".
- Tom sträng när värdet saknar namn.
- ALDRIG task-bokstav (a/b/c) i caption — de hör hemma i subproblem.label.
- label används BARA på subproblem (task-bokstav). På text/latex ska label alltid vara "".

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
- Flera lösningar/värden till SAMMA task: "x=0 och x=-2", "x=1 eller x=2", "x=±…"
  → flera latex-parts UNDER SAMMA subproblem (eller utan subproblem om bara en task). INGEN ny task-bokstav.
- Namngivna delfält i svaret (Mgn, summa, medelpunkt, radie) — använd caption, inte ny subproblem.
- Parenteser i matten: "(a-2b+3c)", "(a+b)^2" är latex, inte label "a".
- Ordproblem / en narrativ fråga — ingen subproblem; "och"/komma listar fakta, inte tasks.
- Osäkerhet — hellre INGEN subproblem än påhittade a/b/c.

Viktigt: Splitta ALDRIG bara för att du ser orden "och", "eller", "respektive", "resp."
De orden används både mellan tasks OCH mellan värden inom en task. Fråga dig:
  "Är detta två olika uppgifter, eller flera svar/värden till samma uppgift?"
  → Olika uppgifter: ny subproblem. Samma uppgift: fler text/latex (caption om namngivna).

KRITISKT — subproblem får ALDRIG stå ensamma:
Efter varje { "type": "subproblem", "label": "a" } MÅSTE följa minst en text- eller latex-part.
FEL:  [subproblem a, subproblem b]
RÄTT: [subproblem a, latex/text…, subproblem b, latex/text…]

════════════════════════════════════════
FLERA SVAR UNDER EN TASK
════════════════════════════════════════
- Flera namngivna resultat: caption + latex/text
  t.ex. Mgn=420, summa=2/15 → latex caption="Mgn" content="420", latex caption="summa" content="\\\\frac{2}{15}"
- Flera onamngivna lösningar: flera latex utan caption
  t.ex. x=0 och x=-2 → latex "x=0", latex "x=-2" (samma subproblem om det är task b)
- Blanda inte in ord som "respektive"/"och" som egna text-parts mellan parallella task-svar — task-gränsen räcker.

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
8. Växla fritt text/latex/text/latex. Fallanalys: latex för villkor, text för "är lösningar" / "lösning saknas", latex för nästa villkor, …
9. Behåll HELA frågetexten. Hitta inte på tasks från givna data i berättelser.
10. Mid-mening tasks: "divideras med (a) x-1 (b) x+2 (c) x^2-x"
    → text "divideras med", subproblem a, latex "x-1", subproblem b, latex "x+2", subproblem c, latex "x^{2}-x".
    FEL: text "(a)" / "(b)" / "(c)" utan latex efter, eller tappa divisorerna.

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

Exempel 9 — fallanalys (du interfolierar text och latex):
Rått svar: "a = 2, b = 1/2 : alla x ≠ 1/2 är lösningar; …"
→ latex "a=2, b=\\\\frac{1}{2}",
   text "alla",
   latex "x\\\\neq\\\\frac{1}{2}",
   text "är lösningar;",
   …
FEL: en type=text med både svenska och \\\\frac.
FEL: en type=latex med svenska orden "alla" / "är lösningar" (inte ens via \\\\text{…}).

Exempel 10 — divisor-tasks mid-mening:
Rå fråga: "… polynomet P(x) divideras med (a) x-1 (b) x+2 (c) x^{2}-x."
→ text "Bestäm resten då polynomet", latex "P(x)", text "divideras med",
   subproblem a, latex "x-1",
   subproblem b, latex "x+2",
   subproblem c, latex "x^{2}-x"
FEL: text "divideras med (a)", subproblem a, text "(b)", subproblem b, text "(c)", subproblem c — utan divisor-latex.`;

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
          "Lumo-problem från OCR-chunk: behåll alltid facit; subproblem endast för skilda tasks; caption för Mgn/summa",
        prompt: `Konvertera denna OCR-chunk till Lumo-språket (ett steg: städa lätt + strukturera).

Viktigt:
- Om rått svar har innehåll: answer.parts MÅSTE spegla det. Skriv ALDRIG "Lösning saknas" som ersättning.
- "Lösning saknas" endast när källan säger det för en specifik task.
- Varje part: ANTINGEN bara svenska (text) ELLER bara matematik (latex). Blanda aldrig. Splitta gärna fint: text, latex, text, latex, …
- Använd inte \\\\text{…} för svenska inne i latex — egen text-part i stället.
- subproblem = skild UPPGIFT/task, aldrig bara för att orden "och"/"eller"/"respektive" förekommer.
- Flera lösningar till samma task (x=0 och x=-2) → flera latex under SAMMA subproblem.
- Namngivna delfält (Mgn, summa, …) → caption på latex/text, inte ny subproblem.
- Efter varje subproblem-label MÅSTE latex eller text komma direkt efter.
- Mid-mening (a) expr (b) expr: varje expr → latex under sin task. Inga text-parts som bara är "(b)".
- "(a-2b+3c)" / "(a+b)^2" är latex, INTE subproblem "a".
- problemNumber utan "P" (t.ex. "1.1").
- Behåll HELA frågan och ALLA ekvationer. Vid tveksamhet: ingen subproblem.

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
