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
- Exempel: "Förenkla", "där", "för alla", "är lösningar", "lösning saknas", "minsta värde", "antas för", "Ja", "Nej".
- Får INTE innehålla TeX eller matematik: ALDRIG \\\\frac, \\\\neq, ^{}, _{}, = mellan uttryck, olikheter, bråk.

type=latex:
- Endast matematik som LaTeX (utan $ eller $$).
- Exempel: "a^{2}+b-c", "\\\\frac{1}{2}", "x\\\\neq 0", "a=2", "a<\\\\frac{81}{4}", "16", "P_{1}".
- Indexerade symboler MÅSTE vara latex: P_1 → "P_{1}".
- Får INTE innehålla svenska ord. Använd INTE \\\\text{svenska}.

════════════════════════════════════════
\\\\frac OCH BRÅK — ALLTID LATEX
════════════════════════════════════════
- Varje bråk / \\\\frac{…}{…} / "p/q" i matematisk betydelse MÅSTE ligga i type=latex.
- Det är FÖRBJUDET att ha strängen "\\\\frac" (eller "\\frac") inne i type=text.
- Blandat prosa+bråk: splitta — text "minsta värde =", latex "\\\\frac{3}{4}", text "antas för", latex "x=-\\\\frac{5}{2}", text "."
- Skriv ALDRIG hela meningen som text bara för att den innehåller svenska ORD runt ett bråk.

Behåll hela olikheter/ekvationer:
- Tappa ALDRIG bort vänstersidan: "a < 81/4" → latex "a<\\\\frac{81}{4}" (INTE "<\\\\frac{81}{4}").
- Samma för "x=", "y=", "a≠", osv. — variabeln hör till latex-delen.

Interfoliering:
- Splitta gärna: text, latex, text, latex, …
- Exempel: text "Undersök om punkterna", latex "P_{1}", text "och", latex "P_{2}", …

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
Använd type=case ENDAST för alternativa villkor/grenar (t.ex. "om a≠0 …; om a=0 …"),
INTE för (a)/(b)/(c)-svarslots.

SPEGELREGEL (kritisk — gör detta rätt direkt, ingen efterfix):
- Om FRÅGAN har subproblem a, b, … MÅSTE SVARET ha exakt samma subproblem-labels a, b, … i samma ordning.
- Facit märkt (a)/(b)/(c) → type=subproblem med label a/b/c. ALDRIG type=case för dessa slots.
- case får BARA användas:
  (1) INUTI en redan öppnad task (efter subproblem b) när den tasken har flera "om …"-villkorsgrenar, ELLER
  (2) när frågan saknar subproblem helt (ren fallanalys).
- Checklist innan du skriver answer.parts: räkna frågans subproblem-labels; spegla dem 1:1 i svaret först; lägg case endast under en task vid behov.

Exempel rätt när frågan har (a)/(b):
  answer: subproblem a, …, subproblem b, …  (ev. case under b)
Exempel FEL: question har a/b men answer börjar med case "1", case "2".

Inuti case gäller samma text/latex-regler: \\\\neq, \\\\frac, a=0 osv. i latex; "om"/"och"/"eller" i text.
- label på case: valfritt "1","2",… eller "".

════════════════════════════════════════
FLERA SVAR UNDER EN TASK ELLER ETT FALL
════════════════════════════════════════
- Namngivna resultat: caption + latex/text (Mgn, summa).
- Flera onamngivna lösningar: flera latex utan ny subproblem/case.

Regler:
1. problemNumber = basnummer UTAN "P" och UTAN bokstav (t.ex. "1.1", inte "P 1.1" / "1.1a").
2. Gemensam ingress som text FÖRE första subproblem; upprepa den inte per task.
3. question och answer ska ha samma subproblem-labels i samma ordning (a→a, b→b). Ersätt ALDRIG dem med case.
4. En enda task: ingen subproblem-part. case endast för villkorsgrenar, inte för task-bokstäver.
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
11. Fallanalys utan (a)/(b) i frågan → case. Har frågan (a)/(b) → answer subproblem a/b; nestla case under en task vid behov.

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

Exempel 9 — fallanalys med type=case när frågan saknar (a)/(b):
Frågan har INGA (a)/(b). Rått svar: "a=2, b=1/2 : alla x≠1/2 är lösningar; …"
→ case "1", latex…, text…, case "2", …
FEL: subproblem a/b/c för dessa grenar.

Exempel 9b — svar med (a)/(b) är SUBPROBLEM, inte case:
Rå fråga har (a)/(b). Rått svar: "(a) Ingen reell lösning (b) x=-3±√65"
→ subproblem a, text "Ingen reell lösning", subproblem b, latex "x=-3\\\\pm\\\\sqrt{65}"
FEL: case 1 / case 2.

Exempel 9c — (a)/(b) plus villkorsgrenar under en task:
Rått svar: "(a) x=a, x=b (b) x=a/b, x=b/a om a≠0 och b≠0; x=0 om …; alla reella x om a=b=0"
→ subproblem a, latex "x=a", latex "x=b",
   subproblem b,
   case "1", latex "x=\\\\frac{a}{b}", latex "x=\\\\frac{b}{a}", text "om", latex "a\\\\neq 0", text "och", latex "b\\\\neq 0",
   case "2", latex "x=0", text "om", …,
   case "3", text "alla reella tal", latex "x", text "om", latex "a=b=0"
FEL: bara case 1–4 utan subproblem a/b.
FEL: text med "a \\\\neq 0" / "\\\\mathrm{om}" blandat — splitta text/latex.

Exempel 10 — indexerade punkter måste vara latex:
Rå fråga: "Undersök om punkterna P _ { 1 } , P _ { 2 } och P _ { 3 } alla ligger …"
→ text "Undersök om punkterna", latex "P_{1}", text ",", latex "P_{2}", text "och", latex "P_{3}", text "alla ligger …"
FEL: en text-part "… punkterna P_1, P_2 och P_3 …"

Exempel 11 — divisor-tasks mid-mening:
Rå fråga: "… divideras med (a) x-1 (b) x+2 (c) x^{2}-x."
→ text "divideras med", subproblem a, latex "x-1", subproblem b, latex "x+2", subproblem c, latex "x^{2}-x"
FEL: text "(b)" utan divisor-latex.

Exempel 12 — prosa + \\\\frac i facit (1.8-stil):
Rått svar: "(a) (x+5/2)^2 + 3/4, minsta värde = 3/4 antas för x = -5/2. Största värde saknas."
→ subproblem a,
   latex "\\\\left(x+\\\\frac{5}{2}\\\\right)^{2}+\\\\frac{3}{4}",
   text "minsta värde =",
   latex "\\\\frac{3}{4}",
   text "antas för",
   latex "x=-\\\\frac{5}{2}",
   text ". Största värde saknas."
FEL: text "minsta värde = \\\\frac{3}{4} antas för x = -\\\\frac{5}{2}…" (\\\\frac i text).

Exempel 13 — tappa inte bort variabeln:
Rått svar: "a < 81/4"
→ latex "a<\\\\frac{81}{4}"
FEL: latex "<\\\\frac{81}{4}" (saknar a).`;

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
- Varje part: ANTINGEN bara svenska (text) ELLER bara matematik (latex). Blanda aldrig.
- \\\\frac / bråk MÅSTE vara type=latex. Det är FÖRBJUDET med "\\\\frac" inne i type=text.
  Prosa runt bråk → splitta: text "minsta värde =", latex "\\\\frac{3}{4}", text "antas för", latex "x=-\\\\frac{5}{2}".
- Behåll hela olikheter: "a < 81/4" → latex "a<\\\\frac{81}{4}" — tappa ALDRIG bort "a"/"x"/vänstersidan.
- Indexerad matte (P_{1}, …) alltid latex.
- Använd inte \\\\text{…} för svenska inne i latex.
- SPEGEL (gör rätt direkt): frågan har subproblem a/b → svaret MÅSTE ha subproblem a/b (samma labels). Facit (a)/(b) ≠ case 1/2.
- case endast INUTI en task för "om …"-grenar, eller om frågan saknar subproblem. Aldrig som ersättning för a/b/c.
- Inuti case: samma text/latex-regler (\\\\neq/\\\\frac i latex; "om"/"och" i text).
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
