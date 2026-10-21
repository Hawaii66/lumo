import {
  PART_TYPES_BASE,
  TEXT_VS_LATEX,
  VERIFY_TEXT_LATEX,
  sections,
} from "./fragments";

/**
 * Generate a structural twin (tvilling) of an existing Lumo problem:
 * same method/structure, different numbers/constants.
 */
export const LUMO_TWIN_INSTRUCTIONS = sections(
  `Du skapar en TVILLING-UPPGIFT (strukturell spegel) av ett befintligt matematikproblem.
Svara med ETT JSON-objekt — ingen prosa utanför JSON.

════════════════════════════════════════
MÅL
════════════════════════════════════════
Behåll samma kärnidé, metod och uppdelning (subproblem/case) som originalet.
Ändra TAL, KONSTANTER och konkreta värden så studenten kan träna samma sak igen.
Skriv ett korrekt facit för den nya varianten.

════════════════════════════════════════
OUTPUT-FORMAT
════════════════════════════════════════
{
  "problemNumber": "1.1·T1",
  "question": { "version": 1, "parts": [ … ] },
  "answer":   { "version": 1, "parts": [ … ] }
}

problemNumber: använd EXAKT det nummer du får i prompten (t.ex. "1.2·T3").

PART-TYPER: alla fem fält krävs: type, content, display, label, caption.
Använd INTE quickReplies (bara text, latex, subproblem, case).`,
  PART_TYPES_BASE,
  TEXT_VS_LATEX,
  `════════════════════════════════════════
TVILLING-REGLER
════════════════════════════════════════
• Behåll samma antal subproblem och samma labels (a)/(b)/(c) som originalet.
• Behåll samma typ av fråga (t.ex. förenkla, derivera, lösa ekvation).
• Byt ut siffror/koefficienter/gränser till rimliga nya värden — inte triviala (inte bara ±1 överallt).
• Facit MÅSTE vara korrekt för den nya frågan. Räkna om.
• Kopiera inte originalets tal verbatim.
• Spegelregeln gäller: answer.parts börjar med samma subproblem-labels i samma ordning.

════════════════════════════════════════
SPEGELREGELN
════════════════════════════════════════
1. Räkna frågans subproblem-labels (a, b, c …).
2. answer.parts MÅSTE börja med samma labels i samma ordning.
3. case läggs INUTI sin task — inte före eller istället för den.`,
);

/** User prompt for one twin generation. */
export function buildTwinPrompt(args: {
  suggestedNumber: string;
  questionText: string;
  answerText: string;
}): string {
  const answerBlock =
    args.answerText.length > 0 ? args.answerText : "(inget svar i källan)";
  return sections(
    `Skapa EN tvilling-uppgift baserad på originalet.

Problemnummer (använd EXAKT): ${args.suggestedNumber}

--- ORIGINAL FRÅGA ---
${args.questionText}

--- ORIGINAL SVAR ---
${answerBlock}`,
    `--- VERIFIERA TYST INNAN DU SVARAR ---
□ problemNumber är exakt "${args.suggestedNumber}"
□ Samma struktur/subproblem som originalet, men andra tal
□ Facit stämmer för den nya frågan
□ Spegel: frågans subproblem-labels → answer har samma labels, samma ordning
□ Varje \\\\frac är i type=latex, aldrig i type=text
${VERIFY_TEXT_LATEX}
□ Varje subproblem/case följs direkt av text eller latex`,
  );
}
