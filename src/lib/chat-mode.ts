import { formatProblemMention } from "~/lib/chat-composer"

export const CHAT_MODES = [
  {
    value: "normal",
    label: "Normal",
    description: "Vanlig hjälp — ställ frågor och välj väg",
  },
  {
    value: "genomgang",
    label: "Genomgång",
    description: "Gå igenom uppgiften steg för steg",
  },
] as const

export type ChatMode = (typeof CHAT_MODES)[number]["value"]

export const DEFAULT_CHAT_MODE: ChatMode = "normal"

function normalizeSubproblemLetter(
  subproblemLetter?: string | null,
): string | null {
  const letter = subproblemLetter?.trim().toLowerCase()
  if (letter !== undefined && letter.length === 1 && /^[a-z]$/.test(letter)) {
    return letter
  }
  return null
}

/** Starter prompt when opening a chat from a problem in this mode. */
export function buildModeStartPrompt(
  mode: ChatMode,
  problemNumber: string,
  fileName: string,
  subproblemLetter?: string | null,
): string {
  const mention =
    problemNumber.trim() && fileName.trim()
      ? formatProblemMention(problemNumber, fileName)
      : ""
  const scoped = normalizeSubproblemLetter(subproblemLetter)
  const body = (() => {
    switch (mode) {
      case "genomgang":
        return scoped !== null
          ? `Gå igenom endast deluppgift (${scoped}) steg för steg och förklara hur man tänker. Hoppa över övriga deluppgifter.`
          : "Gå igenom uppgiften steg för steg och förklara hur man tänker."
      case "normal":
        return scoped !== null
          ? `Hjälp mig med deluppgift (${scoped}).`
          : "Hjälp mig med den här uppgiften."
    }
  })()
  return [mention, body].filter((part) => part.length > 0).join(" ")
}

/** Starter prompt after scanning work from a phone for a problem. */
export function buildScanStartPrompt(
  problemNumber: string,
  fileName: string,
  subproblemLetter?: string | null,
): string {
  const mention =
    problemNumber.trim() && fileName.trim()
      ? formatProblemMention(problemNumber, fileName)
      : ""
  const scoped = normalizeSubproblemLetter(subproblemLetter)
  const body =
    scoped !== null
      ? `Här är mitt arbete hittills för deluppgift (${scoped}) — hjälp mig utifrån det.`
      : "Här är mitt arbete hittills — hjälp mig utifrån det."
  return [mention, body].filter((part) => part.length > 0).join(" ")
}
