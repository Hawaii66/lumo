import { sections } from "./fragments";
import { MD_CONTENT_CONVENTIONS } from "./mdConventions";

/**
 * Step 1 — invent a structural twin QUESTION only (new numbers, same method).
 * Facit is produced in a separate solve step.
 */
export const LUMO_TWIN_VARIANT_INSTRUCTIONS = sections(
  `Du skapar ENDAST FRÅGAN till en TVILLING-UPPGIFT (strukturell spegel).
Svara med ETT JSON-objekt — ingen prosa utanför JSON.
Du skriver INTE facit. Facit skapas i ett senare steg.

════════════════════════════════════════
MÅL
════════════════════════════════════════
Behåll samma kärnidé, metod och uppdelning (### (a) / #### Fall N) som originalet.
Ändra TAL, KONSTANTER och konkreta värden så studenten kan träna samma sak igen.

════════════════════════════════════════
OUTPUT-FORMAT
════════════════════════════════════════
{
  "problemNumber": "1.1·T1",
  "question": "markdown…"
}

problemNumber: använd EXAKT det nummer du får i prompten.
question: markdown + $ / $$ — INGEN answer-nyckel.`,
  MD_CONTENT_CONVENTIONS,
  `════════════════════════════════════════
TVILLING-REGLER (FRÅGA)
════════════════════════════════════════
• Behåll samma ### (a)/(b)/(c) och #### Fall N som källutdraget (samma ordning). Om utdraget bara har en deluppgift: skapa inte övriga.
• Behåll samma typ av fråga (förenkla, derivera, lösa ekvation, …).
• Byt ut siffror/koefficienter/gränser till rimliga nya värden — inte triviala.
• Kopiera inte originalets tal verbatim.
• Skriv INTE lösning eller facit i question.`,
);

/**
 * Step 2 — solve the twin question cold (no original facit).
 * Reasoning may happen silently; the answer field is final facit only.
 */
export const LUMO_TWIN_SOLVE_INSTRUCTIONS = sections(
  `Du löser en matematikuppgift och skriver ENDAST SLUTFACIT i JSON.
Svara med ETT JSON-objekt — ingen prosa utanför JSON.
Du får ENBART den nya frågan — räkna om från scratch. Gissa inte utifrån ett gammalt facit.

Räkna gärna igenom lösningsstegen tyst innan du svarar.
I answer-fältet får ENDAST slutfacit finnas — aldrig lösningssteg, härledningar eller resonemang.

════════════════════════════════════════
OUTPUT-FORMAT
════════════════════════════════════════
{
  "answer": "markdown…"
}

answer: ENBART slutfacit i markdown + $ / $$; spegla ### (a)/(b) och #### Fall N från frågan.`,
  MD_CONTENT_CONVENTIONS,
  `════════════════════════════════════════
FACIT-REGLER
════════════════════════════════════════
• Räkna korrekt för EXAKT de tal som står i frågan.
• Spegelregeln: samma ### (a)/(b)/…-rubriker i samma ordning som frågan.
• answer = ENBART slutfacit (det studenten jämför mot).
  INTE lösningssteg, mellanled, härledningar eller resonemang.
• FÖRBJUDNA i answer: "Lösning:", "För att …", "Vi har …", "Eftersom …",
  "Steg 1", "Beräkning:", långa uträkningskedjor, pedagogiska förklaringar.
• "Lösning saknas" är FÖRBJUDET. Tom answer är FÖRBJUDET.

════════════════════════════════════════
EXEMPEL (stil — inte innehåll)
════════════════════════════════════════
✓ answer:
  ### (a)

  $x=3$

  ### (b)

  $y=\\\\frac{1}{2}$

✗ answer (lösningssteg — FÖRBJUDET):
  ### (a)

  Vi sätter in värdena och får $2x+1=7$, alltså $x=3$.`,
);

export function buildTwinVariantPrompt(args: {
  suggestedNumber: string;
  questionText: string;
  /** Method/structure reference only — never copy its numbers into the new question. */
  answerText: string;
  /** When set, the source texts are already sliced to this deluppgift. */
  subproblemLetter?: string;
}): string {
  const answerBlock =
    args.answerText.length > 0
      ? args.answerText
      : "(inget svar i källan — använd bara frågestrukturen)";
  const isSubproblemTwin = args.subproblemLetter !== undefined;
  const scopeBlock = isSubproblemTwin
    ? `Omfång: tvilling av endast deluppgift (${args.subproblemLetter}) + eventuell gemensam ingress.
Tvillingen är en FRISTÅENDE hel uppgift — skriv INTE ### (${args.subproblemLetter}) eller andra ### (a)/(b)-rubriker.
Behåll gemensam ingress + delens brödtext; behåll #### Fall N om de finns i utdraget.
Skapa INTE övriga deluppgifter som saknas i utdraget.`
    : `Behåll samma ### (a)/(b)/(c) och #### Fall N som originalet (samma ordning).`;
  const structureCheck = isSubproblemTwin
    ? `□ Fristående hel uppgift — ingen ### (${args.subproblemLetter}) / ### (a)/(b); behåll #### Fall N om de fanns; andra tal`
    : `□ Samma ### / #### Fall-struktur som utdraget ovan, men andra tal`;
  return sections(
    `Skapa EN tvilling-FRÅGA baserad på originalet (inga facit).

Problemnummer (använd EXAKT): ${args.suggestedNumber}

${scopeBlock}

--- ORIGINAL FRÅGA ---
${args.questionText}

--- ORIGINAL FACIT (endast metod/struktur — kopiera INGA tal) ---
${answerBlock}`,
    `--- VERIFIERA TYST INNAN DU SVARAR ---
□ problemNumber är exakt "${args.suggestedNumber}"
${structureCheck}
□ JSON har bara problemNumber + question (ingen answer)
□ Matte bara i $ / $$`,
  );
}

export function buildTwinSolvePrompt(args: {
  suggestedNumber: string;
  questionText: string;
}): string {
  return sections(
    `Lös denna uppgift från scratch.
Räkna tyst igenom stegen, men skriv ENDAST slutfacit i answer.

Problemnummer (kontext): ${args.suggestedNumber}

--- FRÅGA ATT LÖSA ---
${args.questionText}`,
    `--- VERIFIERA TYST INNAN DU SVARAR ---
□ Facit stämmer för EXAKT dessa tal
□ Samma ### / #### Fall-rubriker som frågan, samma ordning
□ answer = BARA slutfacit — inga lösningssteg / "Vi har" / "För att"
□ answer är icke-tom; aldrig "Lösning saknas"
□ Matte bara i $ / $$`,
  );
}
