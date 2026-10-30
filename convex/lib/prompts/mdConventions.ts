import { sections } from "./fragments";

/** Shared markdown + `$`/`$$` conventions for chat, PDF convert, and twins. */
export const MD_MATH_RULES = `════════════════════════════════════════
MARKDOWN + LATEX
════════════════════════════════════════
• Prosa = vanlig markdown (stycken, listor, **fetstil**, *kursiv*).
• Matematik ENDAST inne i $...$ (inline) eller $$...$$ (block).
• ALDRIG TeX-delimitrar \\( \\) eller \\[ \\] — använd bara $ / $$.
• INGEN rå TeX utanför $-delimitrar.
• INGEN \\\\text{svenska} / \\\\mathrm{Ja} — skriv prosa utanför matten.
  ✓ Vi får $x=\\\\frac{3}{4}$ när $t=2$.
  ✗ Vi får x=\\\\frac{3}{4} när t=2
  ✗ $\\\\text{Vi får }x=\\\\frac{3}{4}$`;

export const MD_SUBPROBLEM_CASE_RULES = `════════════════════════════════════════
DELUPPGIFTER (a)/(b)/(c)
════════════════════════════════════════
• Rubrik vars HELA titel är bokstaven i parentes:
    ### (a)
    <brödtext + matte>
    ### (b)
    …
• INTE "### (a) Förenkla …" — bokstaven ensam i rubriken.
• En enda task → INGEN deluppgiftsrubrik.
• Parentes i matten "(a-2b)^2" är INTE en deluppgift.
• Vid tveksamhet → hellre ingen deluppgiftsrubrik.

════════════════════════════════════════
FALL / VILLKORSGRENAR
════════════════════════════════════════
• Under aktuell deluppgift (eller toppnivå om hela svaret är fallanalys):
    #### Fall 1: $x > 0$
    …
    #### Fall 2: $x \\\\le 0$
    …
• Fall ersätter ALDRIG (a)/(b)/(c).
• Nestla fall INUTI sin deluppgift.

════════════════════════════════════════
SPEGELREGELN
════════════════════════════════════════
1. Räkna frågans ### (a)/(b)/…-rubriker.
2. Svaret MÅSTE ha samma rubriker i samma ordning.
3. Fall-rubriker behålls under samma deluppgift.`;

export const MD_CAPTION_DROP = `• Inga caption-fält. Skriv värdenamn i prosa: "Mgn är $420$" / "summan är $\\\\frac{2}{15}$".`;

/** Prompt block used by PDF convert + twin (+ referenced from chat). */
export const MD_CONTENT_CONVENTIONS = sections(
  MD_MATH_RULES,
  MD_SUBPROBLEM_CASE_RULES,
  MD_CAPTION_DROP,
);
