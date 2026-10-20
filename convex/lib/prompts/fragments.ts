/** Join non-empty prompt sections with blank lines. */
export function sections(
  ...blocks: Array<string | false | undefined | null>
): string {
  return blocks.filter((b): b is string => typeof b === "string" && b.length > 0).join(
    "\n\n",
  );
}

/** Shared text ↔ latex purity rules (format + PDF convert). */
export const TEXT_VS_LATEX = `════════════════════════════════════════
TEXT vs LATEX — DELA ALLTID UPP
════════════════════════════════════════
INGEN latex i text. INGEN text i latex. Splitta: text / latex / text / latex / …

type=text  → enbart naturlig svenska/engelska — INGA backslash (\\\\).
  ✓ "Förenkla", "där", "Nästa steg:", "Ja", "Nej", "ingen lösning", "."
  ✗ \\\\frac, \\\\sqrt, \\\\text, ^{}, _{}, matematiska symboler, olikheter, bråk
  HARD: om content innehåller \\\\ → det FÅR INTE vara type=text. Flytta till latex.

type=latex  → enbart LaTeX-matematik (utan $ eller $$).
  ✓ "a^{2}+b-c", "\\\\frac{1}{2}", "x\\\\neq 0", "P_{1}", "\\\\sqrt{3}"
  ✗ svenska ord; \\\\text{där}; \\\\mathrm{Nej}
  HARD: Svenska svarord ("Ja", "Nej", "ingen lösning") → type=text,
    ALDRIG latex med \\\\mathrm / \\\\text runt dem.
  RÄTT: text "Vi får", latex "x=\\\\frac{3}{4}", text "när", latex "t=2"
  FEL:  text "Vi får x=\\\\frac{3}{4} när t=2"
  RÄTT: text "minsta värde =", latex "\\\\frac{3}{4}", text "antas för", latex "x=-\\\\frac{5}{2}"
  FEL:  text "minsta värde = \\\\frac{3}{4} antas för x = -\\\\frac{5}{2}"

• Varje bråk (\\\\frac) och varje matematisk symbol MÅSTE vara type=latex.
• Tappa ALDRIG vänsterledet: "a < 81/4" → latex "a<\\\\frac{81}{4}"  (inte "<\\\\frac{81}{4}")
• Indexerade symboler (P_{1}, α_{1}) → alltid type=latex, aldrig type=text.`;

/**
 * Shared field rules for text / latex / subproblem / case.
 * Format adds choices + quickReplies; convert forbids quickReplies.
 */
export const PART_TYPES_BASE = `════════════════════════════════════════
PART-TYPER
════════════════════════════════════════

type=text
  content : svensk/engelsk prosa (inga \\\\ — se TEXT vs LATEX)
  display : "inline"
  label : ""
  caption : valfritt värdenamn ("Mgn", "summa"); "" annars

type=latex
  content : matematik (se TEXT vs LATEX)
  display : "inline" | "block"
  label : ""
  caption : valfritt värdenamn; "" annars

type=subproblem  — markör för deluppgift (a)/(b)/(c)
  label   : "a" | "b" | "c" … — ALDRIG tom; ALDRIG värdenamn som "Mgn"
  content, caption : ""
  display : "inline"
  ⚠ MÅSTE följas av minst en text- eller latex-part.

type=case  — villkorsfall / "om …"-gren (INTE samma som subproblem)
  label   : "1", "2", … eller ""
  content, caption : ""
  display : "inline"
  ⚠ MÅSTE följas av innehållspart direkt efter.`;

/** Format-only: clickable student follow-up questions. */
export const PART_TYPES_QUICK_REPLIES = `type=quickReplies  — klickbara frågor som skickas som studentens nästa meddelande
  choices : [{ "id": "opt1", "label": "Varför samlar vi x-termerna först?" }, …]  — minst ett, helst 2–4
  content, label, caption : ""
  display : "inline"
  • Labels = konkreta frågor studenten skulle ställa till dig (första person / frågeform).
  • Labels skickas oförändrade som nästa user-meddelande — de måste gå att besvara direkt.
  • Lägg quickReplies SIST i parts.
  • Ge INTE facit i en knapp-label.`;

/** Shared verify bullets for text/latex purity (format + convert). */
export const VERIFY_TEXT_LATEX = `□ type=text: ingen \\\\ / matematik  |  type=latex: ingen svenska / \\\\text
□ Prosa runt matte är splittrad: text / latex / text
□ Vänsterled bevarat: "a < 81/4" → latex "a<\\\\frac{81}{4}"
□ Indexerade symboler (P_{1}) → type=latex`;
