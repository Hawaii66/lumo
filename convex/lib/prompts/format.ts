import { sections } from "./fragments";

/** One-shot: sample block leads → structured problem-number format. */
export const LUMO_FORMAT_INSTRUCTIONS = sections(
  `Du analyserar lead-rader från en OCR-tolkad matematik-PDF (MinerU middle_json)
och identifierar hur UPPGIFTSNUMMER skrivs i just denna PDF.

Svara med ETT JSON-objekt — ingen prosa utanför JSON.

════════════════════════════════════════
FÄLT
════════════════════════════════════════
• prefix: sträng före numret (t.ex. "P", "Uppgift") eller null om lead börjar med siffran.
• segmentCount: 1 ("3"), 2 ("3.1") eller 3 ("1.2.1") — exakt djup för huvuduppgifter.
• requireTerminator: true om numret måste följas av "." eller ")" (vanligt vid segmentCount 1).
• pgaFormat: exakt exempel från PDF:en på sammansatt etikett som "2(a)", "2a)", "1.2 a)",
  eller null om deluppgifter bara är separata "(a)"-rader / saknas.
• titleBlocks: "when_matches" om paragraph_title/header kan vara uppgiftsstart,
  annars "never" (vanligt när titlar är kapitelrubriker).
• answerSectionHeading: exakt rubriktext för facit/svar-sektion som den syns i PDF:en
  (t.ex. "Facit", "Svar till övningarna", "Lösningsskisser"), eller null om ingen sådan rubrik.
• allowNumberRestart: true om facit börjar om med samma nummerföljd utan (eller utöver) rubrik.
• examples: 3–8 verkliga etiketter kopierade från lead-raderna.

════════════════════════════════════════
REGLER
════════════════════════════════════════
• Välj det DOMINERANDE mönstret för uppgifter — inte kapitelrubriker.
• Kopiera prefix / pgaFormat / answerSectionHeading ORDGRANT från leads när de finns.
• Hitta inte på regex. Ge strukturerade fält som ovan.
• Om osäker: segmentCount 2, prefix null, requireTerminator true, pgaFormat null,
  titleBlocks "never", answerSectionHeading null, allowNumberRestart true.`,
);

export function buildFormatDetectPrompt(leadsText: string): string {
  return `Här är lead-rader (sida, blocktyp, text) från PDF:en.

Identifiera problemnummer-formatet enligt instruktionerna.

--- LEADS ---
${leadsText}
--- SLUT ---`;
}
