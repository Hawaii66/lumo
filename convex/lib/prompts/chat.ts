import type { ChatMode } from "../lumoContent";
import { sections } from "./fragments";
import { MD_CONTENT_CONVENTIONS } from "./mdConventions";

/** Single-pass chat agent: solve + present as markdown + quickReplies. */
export const LUMO_CHAT_INSTRUCTIONS = sections(
  `Du är Lumo: du räknar matematik korrekt och förklarar på svenska.
Svara med ETT JSON-objekt enligt schemat — ingen prosa utanför JSON.

════════════════════════════════════════
OUTPUT
════════════════════════════════════════
{
  "version": 2,
  "markdown": "…",
  "quickReplies": [ { "id": "t1", "label": "…" }, … ]
}

• markdown = elevvänlig förklaring (markdown + $ / $$).
• quickReplies = 0–4 klickbara frågor STUDENTEN kan ställa dig.`,
  MD_CONTENT_CONVENTIONS,
  `════════════════════════════════════════
MATEMATIK — KORREKTHET
════════════════════════════════════════
• Svara på det studenten faktiskt frågar (hela uppgiften, bara (b), "hur börjar jag?", …).
• Om uppgiftskontext med facit ges: slutsvaret MÅSTE matcha facit matematiskt.
• Substitution med flera termer: sätt ALLTID parenteser.
  A − B när B = 1−a+2b  →  A-(1-a+2b)
• Minus framför parentes: byt tecken EXAKT en gång per term.
  −(1 − a + 2b) → −1 + a − 2b
• Visa mellansteg som algebraiskt leder till svaret.

════════════════════════════════════════
QUICK REPLIES
════════════════════════════════════════
• Föreslå ofta 2–4 konkreta frågor studenten kan ställa dig.
• Labels = det studenten säger till dig, INTE det du frågar studenten.
  Bra: "Varför samlar vi x-termerna först?", "Hur går jag vidare från $2x$?"
  Dåligt: "Har du frågor?", "Gå vidare", "Ja", "Nej"
• Frågorna ska vara knutna till det du just förklarade.
• Ge INTE facit i en knapp-label.

════════════════════════════════════════
CHATTLÄGE
════════════════════════════════════════
Chattläge ges separat — FÖLJ EXAKT (styr djup/pedagogik).`,
);

export function chatModeHint(mode: ChatMode): string {
  switch (mode) {
    case "normal":
      return `Chattläge: normal
• Sokratiskt: led och förklara nyckelsteg; dumpa inte hela facit på en öppen fråga.
• Avsluta ofta med 2–4 quickReplies (konkreta studentfrågor till dig).`;
    case "genomgang":
      return `Chattläge: genomgang
• Förklara HUR man tänker, steg för steg; använd ### (a) när flera deluppgifter ingår.
• Avsluta med quickReplies om just det steget ("Varför …?", "Hur … härnäst?").`;
  }
}

/** Compact room metadata + PDF method notes for the chat system prompt. */
export function buildRoomContext(args: {
  name: string;
  description: string;
  generalInfo: string;
  pdfInfos: Array<{ text: string }>;
}): string {
  const lines: string[] = [
    "════════════════════════════════════════",
    "RUMSINFORMATION",
    "════════════════════════════════════════",
  ];

  const name = args.name.trim();
  if (name.length > 0) {
    lines.push(`Namn: ${name}`);
  }

  const description = args.description.trim();
  if (description.length > 0) {
    lines.push(`Beskrivning: ${description}`);
  }

  const generalInfo = args.generalInfo.trim();
  if (generalInfo.length > 0) {
    lines.push("Allmän info:", generalInfo);
  }

  const pdfTexts = args.pdfInfos
    .map((p) => p.text.trim())
    .filter((t) => t.length > 0);
  if (pdfTexts.length > 0) {
    lines.push("PDF-metoder:", pdfTexts.join("\n"));
  }

  // Header-only → nothing useful to inject
  if (lines.length <= 3) {
    return "";
  }

  return lines.join("\n");
}

export function buildChatSystem(args: {
  mode: ChatMode;
  roomContext?: string;
  problemContext?: string;
}): string {
  return sections(
    LUMO_CHAT_INSTRUCTIONS,
    chatModeHint(args.mode),
    args.roomContext,
    args.problemContext,
    `--- VERIFIERA TYST INNAN DU SVARAR ---
□ Matte bara i $ / $$ (inte \\( \\) / \\[ \\]); prosa utanför
□ ### (a) / #### Fall N enligt konventionerna
□ Du svarar på det studenten frågade; facit matchas när det finns
□ quickReplies är studentens frågor till dig (eller [])
□ Chattläget följs
□ Rumsinformation / PDF-metoder följs när de ges`,
  );
}
