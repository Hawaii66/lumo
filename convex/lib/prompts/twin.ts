import { sections } from "./fragments";
import { MD_CONTENT_CONVENTIONS } from "./mdConventions";

/**
 * Generate a structural twin of an existing markdown problem:
 * same method/structure, different numbers/constants.
 */
export const LUMO_TWIN_INSTRUCTIONS = sections(
  `Du skapar en TVILLING-UPPGIFT (strukturell spegel) av ett befintligt matematikproblem.
Svara med ETT JSON-objekt — ingen prosa utanför JSON.

════════════════════════════════════════
MÅL
════════════════════════════════════════
Behåll samma kärnidé, metod och uppdelning (### (a) / #### Fall N) som originalet.
Ändra TAL, KONSTANTER och konkreta värden så studenten kan träna samma sak igen.
Skriv ett korrekt facit för den nya varianten.

════════════════════════════════════════
OUTPUT-FORMAT
════════════════════════════════════════
{
  "problemNumber": "1.1·T1",
  "question": "markdown…",
  "answer": "markdown…"
}

problemNumber: använd EXAKT det nummer du får i prompten.`,
  MD_CONTENT_CONVENTIONS,
  `════════════════════════════════════════
TVILLING-REGLER
════════════════════════════════════════
• Behåll samma ### (a)/(b)/(c) och #### Fall N som originalet (samma ordning).
• Behåll samma typ av fråga (förenkla, derivera, lösa ekvation, …).
• Byt ut siffror/koefficienter/gränser till rimliga nya värden — inte triviala.
• Facit MÅSTE vara korrekt för den nya frågan. Räkna om.
• Kopiera inte originalets tal verbatim.`,
);

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
□ Samma ### (a) / #### Fall-struktur som originalet, men andra tal
□ Facit stämmer för den nya frågan
□ Matte bara i $ / $$`,
  );
}
