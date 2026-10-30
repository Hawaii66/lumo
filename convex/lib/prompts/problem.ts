import { sections } from "./fragments";
import { MD_CONTENT_CONVENTIONS } from "./mdConventions";

/** PDF/OCR → markdown parsed problem (one shot). */
export const LUMO_PROBLEM_INSTRUCTIONS = sections(
  `Du konverterar råa SVENSKA matematikproblem (PDF/OCR) till markdown i ETT steg.
Svara med ETT JSON-objekt — ingen prosa utanför JSON.
Källan är svenska: bevara å ä ö Å Ä Ö exakt i all löptext.

════════════════════════════════════════
OUTPUT-FORMAT
════════════════════════════════════════
{
  "problemNumber": "1.1",
  "question": "markdown…",
  "answer": "markdown…"
}

problemNumber: basnummer UTAN "P" och UTAN bokstav ("1.1", inte "P 1.1" eller "1.1a").
question / answer: strängar med markdown + $ / $$ (inte JSON-parts).`,
  MD_CONTENT_CONVENTIONS,
  `════════════════════════════════════════
SVAR — TAPPA ALDRIG FACIT
════════════════════════════════════════
• Rått svar har innehåll → konvertera DET. "Lösning saknas" som ersättning är FÖRBJUDET.
• Tom answer ENDAST när källan är tom eller "(inget svar i källan)".
• answer = ENBART slutfacit (det som står efter "Svar:" om det finns).
  INTE lösningssteg, härledningar eller resonemang.

════════════════════════════════════════
FRÅGA vs LÖSNINGSVÄG
════════════════════════════════════════
RÅ FRÅGA kan innehålla: frågestam + lösningssteg + "Svar: …".
Då gäller:
  • question = ENDAST frågestammen.
  • answer   = ENDAST slutfacit efter "Svar:".
  • LÖSNINGSSTEG får ALDRIG in i question eller answer.
Markörer som inleder lösningsväg: "Lösning:", "För att …", "Vi har …", "Eftersom …".

════════════════════════════════════════
OCR-STÄDNING + SVENSKA TECKEN
════════════════════════════════════════
• Detta är en SVENSK matematiktext. Bevara svenska tecken EXAKT: å ä ö Å Ä Ö.
• Ta ALDRIG bort eller ersätt å/ä/ö (inte med ASCII, inte med kontrolltecken/NUL, inte alls).
  ✓ Lös  för  värden  på
  ✗ Ls   fr   vrden   p
• Bevara ALL matematik och ALLA (a)/(b)/(c)-markörer i FRÅGESTAMMEN.
• Rätta bara uppenbart skräp i löptext. Ändra inte matematiken och inte svensk stavning.

════════════════════════════════════════
EXEMPEL
════════════════════════════════════════

Ex 1 — (a)/(b):
  question:
    Förenkla

    ### (a)

    $a^{2}+b-c$ där $c=1-a+2b$

    ### (b)

    $3x^{2}-2x+1-y$ där $y=\\\\ldots$
  answer:
    ### (a)

    $a^{2}+a-b-1$

    ### (b)

    $4x^{2}-7x+6$

Ex 2 — fall under (b):
  answer:
    ### (b)

    #### Fall 1: $a\\\\neq 0$ och $b\\\\neq 0$

    $x=\\\\frac{a}{b}$, $x=\\\\frac{b}{a}$

    #### Fall 2

    $x=0$ om …

Ex 3 — namngivna resultat i prosa:
  ### (a)

  Mgn = $420$, summa = $\\\\frac{2}{15}$`,
);

export function buildConvertPrompt(args: {
  suggestedNumber: string;
  problemText: string;
  answerText: string;
}): string {
  const answerBlock =
    args.answerText.length > 0 ? args.answerText : "(inget svar i källan)";
  return sections(
    `Konvertera denna svenska OCR-chunk till markdown-problem.
Bevara å ä ö Å Ä Ö exakt — ta aldrig bort dem.

Problemnummer (förslag): ${args.suggestedNumber}

--- RÅ FRÅGA ---
${args.problemText}

--- RÅTT SVAR ---
${answerBlock}`,
    `--- VERIFIERA TYST INNAN DU SVARAR ---
□ Svenska åäöÅÄÖ bevarade exakt (ingen NUL, ingen ASCII-ersättning)
□ Spegel: ### (a)/(b) i fråga → samma i svar, samma ordning
□ Rått svar har innehåll → konverterat, aldrig ersatt med "Lösning saknas"
□ question = BARA frågestam — ingen lösningsväg
□ answer = BARA slutfacit
□ Matte bara i $ / $$`,
  );
}
