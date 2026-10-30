import { sections } from "./fragments";

/** Max characters stored in pdfInfo.text after distillation. */
export const PDF_INFO_MAX_LENGTH = 2000;

/**
 * Agent instructions: PDF/OCR → expected course methods / techniques.
 * Not problem extraction — that is a separate pipeline.
 */
export const LUMO_INFO_INSTRUCTIONS = sections(
  `Du läser rå SVENSK OCR-text från en PDF och ska sammanfatta vilka MATEMATISKA
METODER och tillvägagångssätt som förväntas i kursen / materialet.

Detta är INTE uppgiftstolkning och INTE AI-beteenderegler. Du ska INTE
återberätta uppgifter, och du ska INTE skriva om vad en assistent får/inte
får göra (ledtrådar, facit, ton, osv.).

Bevara svenska tecken å ä ö Å Ä Ö exakt i output — ta aldrig bort eller ersätt dem.

════════════════════════════════════════
VAD DU SKA TA FRÅN TEXTEN
════════════════════════════════════════
• Metoder som ska användas eller prioriteras (t.ex. substitution, partialbråk,
  induktion, egenvärden, …)
• När en metod passar / när en annan ska väljas i stället
• Standardansatser, rekommenderade lösningssätt, "gör så här"-råd på metodnivå
• Notation och konventioner som hör till metoderna (om de står i texten)
• Kurs-/kapitelkontext som förklarar vilka tekniker som ingår

════════════════════════════════════════
VAD DU MÅSTE IGNORERA
════════════════════════════════════════
• Enskilda uppgifter (P 1.1, (a)/(b), "beräkna", "visa att", …)
• Uppgiftstext, givna uttryck, villkor för EN uppgift
• Facit, lösningar och mellansteg till specifika problem
• Regler för hur en AI/lärare ska hjälpa studenten
• Sidhuvuden/sidnummer/layout, rena övningslistor utan metodråd

Om PDF:en BARA innehåller uppgifter utan metodråd: returnera tom text "".
Hitta inte på metoder.

════════════════════════════════════════
OUTPUT
════════════════════════════════════════
Svara med ETT JSON-objekt:
{ "text": "…" }

• text: svenska, ren prosa — vilka metoder som förväntas; behåll åäöÅÄÖ.
• Formulera som metodråd: "Använd …", "Föredra … framför …", "Vid … passa …".
• Strukturera med korta stycken eller punktlistor (radbrytningar OK).
• Max cirka ${PDF_INFO_MAX_LENGTH} tecken.
• Hitta inte på innehåll som inte finns i källan.
• Om inga metodråd finns: { "text": "" }.`,
);

/** User prompt for one full-document info convert. */
export function buildInfoConvertPrompt(documentText: string): string {
  const clipped =
    documentText.length > 60_000
      ? `${documentText.slice(0, 60_000)}\n\n[…klippt…]`
      : documentText;

  return sections(
    `Extrahera ENDAST vilka metoder/tillvägagångssätt som förväntas.
Ignorera uppgifter, facit och AI-/hjälpregler.
Om dokumentet saknar metodråd → text = "".`,
    "─── OCR ───",
    clipped,
    "─── SLUT ───",
    `Returnera JSON: { "text": "…" }`,
  );
}
