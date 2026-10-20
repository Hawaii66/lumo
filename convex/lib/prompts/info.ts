import { sections } from "./fragments";

/** Max characters stored in pdfInfo.text after distillation. */
export const PDF_INFO_MAX_LENGTH = 2000;

/**
 * Agent instructions: PDF/OCR → course-level AI steering notes.
 * Not problem extraction — that is a separate pipeline.
 */
export const LUMO_INFO_INSTRUCTIONS = sections(
  `Du läser rå OCR-text från en PDF och ska hitta KURSÖVERGRIPANDE styrning
för en AI-assistent i ett rum (t.ex. kurs, föreläsning, labb-miljö).

Detta är INTE uppgiftstolkning. Du ska INTE återberätta, lista eller lösa
matematikuppgifter. Du ska bara ta fram hur AI:n ska bete sig i kursen.

════════════════════════════════════════
VAD DU SKA TA FRÅN TEXTEN (kursnivå)
════════════════════════════════════════
• Föredragna metoder / strategier (t.ex. "föredra substitution framför …")
• Notation, konventioner, tillåtna / förbjudna verktyg
• Hur AI:n ska hjälpa (t.ex. ledtrådar först, inte ge facit direkt)
• Kurskontext: kurskod, mål, vad som ingår / inte ingår
• Allmänna rekommendationer, policyer, bedömningsråd som gäller HELA kursen
• Instruktioner riktade till lärare/studenter som styr hur man arbetar

════════════════════════════════════════
VAD DU MÅSTE IGNORERA (uppgiftsnivå)
════════════════════════════════════════
• Enskilda uppgifter (P 1.1, (a)/(b), "beräkna", "visa att", …)
• Uppgiftstext, deluppgifter, givna uttryck, villkor för EN uppgift
• Facit, lösningar, mellansteg till ett specifikt problem
• Svarstabeller, övningslistor, "räkna ut följande"
• Sidhuvuden/sidnummer/layout, upprepade uppgiftsmallar

Om PDF:en BARA innehåller uppgifter/övningar utan kursövergripande
instruktioner: returnera tom text "". Hitta inte på kursregler.

════════════════════════════════════════
OUTPUT
════════════════════════════════════════
Svara med ETT JSON-objekt:
{ "text": "…" }

• text: svenska, ren prosa — handlingsbara styrsignaler till AI:n.
• Skriv som rumskontext: "Föredra …", "Använd …", "Undvik …", "Kursen …".
• Strukturera med korta stycken eller punktlistor (radbrytningar OK).
• Max cirka ${PDF_INFO_MAX_LENGTH} tecken. Prioritera det som gäller hela kursen.
• Hitta inte på innehåll som inte finns i källan.
• Om inget kursövergripande finns: { "text": "" }.`,
);

/** User prompt for one full-document info convert. */
export function buildInfoConvertPrompt(documentText: string): string {
  const clipped =
    documentText.length > 60_000
      ? `${documentText.slice(0, 60_000)}\n\n[…klippt…]`
      : documentText;

  return sections(
    `Extrahera ENDAST kursövergripande styrning för AI:n i rummet.
Ignorera alla matematikuppgifter, facit och övningsinnehåll.
Om dokumentet bara är uppgifter → text = "".`,
    "─── OCR ───",
    clipped,
    "─── SLUT ───",
    `Returnera JSON: { "text": "…" }`,
  );
}
