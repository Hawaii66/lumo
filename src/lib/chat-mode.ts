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

export function isChatMode(value: string): value is ChatMode {
  return CHAT_MODES.some((mode) => mode.value === value)
}

export function chatModeLabel(mode: ChatMode): string {
  return CHAT_MODES.find((item) => item.value === mode)?.label ?? mode
}

/** Starter prompt when opening a chat from a problem in this mode. */
export function buildModeStartPrompt(
  mode: ChatMode,
  problemNumber: string,
  subproblemLetter?: string | null,
): string {
  const mention = problemNumber.trim() ? `@${problemNumber.trim()}` : ""
  const letter = subproblemLetter?.trim().toLowerCase()
  const scoped =
    letter !== undefined && letter.length === 1 && /^[a-z]$/.test(letter)
      ? letter
      : null
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
