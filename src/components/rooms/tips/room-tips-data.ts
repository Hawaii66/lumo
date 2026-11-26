import type { LucideIcon } from "lucide-react"
import {
  AtSign,
  Bookmark,
  Check,
  Coins,
  Copy,
  Eye,
  CalendarDays,
  Footprints,
  Lightbulb,
  Palette,
  ScanSearch,
  Sigma,
  Sparkles,
  Star,
  Type,
  Bot,
} from "lucide-react"

export const ROOM_TIP_IDS = [
  "forsta-steget",
  "genomgang",
  "phone-scan",
  "math-input",
  "mention-problems",
  "mark-complete",
  "mark-reason",
  "star-difficulty",
  "facit-toggle",
  "twin-problems",
  "change-model",
  "default-model",
  "text-size",
  "change-theme",
  "credits",
  "occasions",
] as const

export type RoomTipId = (typeof ROOM_TIP_IDS)[number]

export type RoomTipActionKind = "profile" | "credits" | "occasions"

export type RoomTipAction = {
  label: string
  kind: RoomTipActionKind
}

export type RoomTip = {
  id: RoomTipId
  title: string
  /** Short label on the tip button (grid). */
  buttonLabel: string
  description: string
  icon: LucideIcon
  action?: RoomTipAction
}

export const ROOM_TIPS: Array<RoomTip> = [
  {
    id: "forsta-steget",
    title: "Första steget",
    buttonLabel: "Första steget",
    description:
      "Välj omfång (Hela eller en deluppgift) och tryck Första steget när du inte vet var du ska börja — en liten ledtråd, inte hela lösningen. Du kan också växla läge med /läge i chatten.",
    icon: Footprints,
  },
  {
    id: "genomgang",
    title: "Genomgång",
    buttonLabel: "Genomgång",
    description:
      "Välj omfång och tryck Genomgång för steg-för-steg-hjälp — inte en facitdump. Du kan också växla läge med /läge i chatten.",
    icon: Lightbulb,
  },
  {
    id: "phone-scan",
    title: "Skanna med telefon",
    buttonLabel: "Skanna",
    description:
      "Välj omfång, skanna QR-koden på datorn och ta en bild med telefonen — AI hjälper dig där du kört fast eller hittar små slarvfel.",
    icon: ScanSearch,
  },
  {
    id: "math-input",
    title: "Skriv formler",
    buttonLabel: "Formler",
    description:
      "Skriv /formel eller tryck Formel-knappen för att öppna MathLive. Formlerna skickas korrekt formaterade så AI förstår vad du menar.",
    icon: Sigma,
  },
  {
    id: "mention-problems",
    title: "@-nämn uppgifter",
    buttonLabel: "@-nämn",
    description:
      "Skriv @ följt av uppgiftsnummer (t.ex. @2a) så klipps rätt uppgift in i chatten — även från en fri chatt.",
    icon: AtSign,
  },
  {
    id: "mark-complete",
    title: "Markera som klar",
    buttonLabel: "Klar",
    description:
      "Bocka av färdiga uppgifter med kryssrutan bredvid uppgiftstiteln eller deluppgiften. Klara uppgifter syns i sidolistan.",
    icon: Check,
  },
  {
    id: "mark-reason",
    title: "Markera med anledning",
    buttonLabel: "Anledning",
    description:
      "Spara en markering — Svår, Bra insikt, Behöver lärarhjälp eller Övrigt — med valfri anteckning. Filtrera på markerade i sidolistan.",
    icon: Bookmark,
  },
  {
    id: "star-difficulty",
    title: "Svårighetsstjärnor",
    buttonLabel: "Stjärnor",
    description:
      "Poängsätt uppgifter med 1–3 stjärnor och filtrera listan så du pluggar i rätt ordning.",
    icon: Star,
  },
  {
    id: "facit-toggle",
    title: "Visa/dölj facit",
    buttonLabel: "Facit",
    description:
      "Facit är dolt som standard. Tryck Visa facit i uppgiftshuvudet när du vill kolla svaret.",
    icon: Eye,
  },
  {
    id: "twin-problems",
    title: "Tvillinguppgifter",
    buttonLabel: "Tvilling",
    description:
      "Skapa en tvilling där AI genererar en ny liknande uppgift (nya tal, samma metod) så du kan öva mer. Kostar credits.",
    icon: Copy,
  },
  {
    id: "change-model",
    title: "Byt chattmodell",
    buttonLabel: "Byt modell",
    description:
      "Välj Snabb, Smart eller Pro för den öppna chatten via Modell i chathuvudet eller /modell i rutan. Gäller nästa meddelande.",
    icon: Bot,
  },
  {
    id: "default-model",
    title: "Standardmodell",
    buttonLabel: "Standard",
    description:
      "Sätt standard för nya chattar med stjärnan i modellmenyn eller under Standardmodell i din profil.",
    icon: Sparkles,
    action: { label: "Ändra i profil", kind: "profile" },
  },
  {
    id: "text-size",
    title: "Ändra textstorlek",
    buttonLabel: "Textstorlek",
    description:
      "Justera storlek på uppgiftstext och formler i uppgiftsvyn och chatten under Textstorlek i din profil.",
    icon: Type,
    action: { label: "Ändra i profil", kind: "profile" },
  },
  {
    id: "change-theme",
    title: "Byt tema",
    buttonLabel: "Tema",
    description:
      "Välj Ljus, Mörk, Lila, Hav eller Rosé under Tema i din profil (eller på dashboard). Temat sparas på ditt konto.",
    icon: Palette,
    action: { label: "Ändra i profil", kind: "profile" },
  },
  {
    id: "credits",
    title: "Dagliga credits",
    buttonLabel: "Credits",
    description:
      "Du får gratis dagliga credits som fylls på vid midnatt. Chattmeddelanden och tvillinguppgifter kostar credits.",
    icon: Coins,
    action: { label: "Se saldo", kind: "credits" },
  },
  {
    id: "occasions",
    title: "Tillfällen",
    buttonLabel: "Tillfällen",
    description:
      "Gruppera uppgifter per lektion eller dag. Fortsätt med … tar dig till nästa ofärdiga tilldelade uppgift.",
    icon: CalendarDays,
    action: { label: "Hantera tillfällen", kind: "occasions" },
  },
]
