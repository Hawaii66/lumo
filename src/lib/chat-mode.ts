export const CHAT_MODES = [
  {
    value: "normal",
    label: "Normal",
    description: "Vanlig hjälp — ställ frågor och välj väg",
  },
  {
    value: "thoughtProcess",
    label: "Tankegång",
    description: "Förklara hur man tänker steg för steg",
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
): string {
  const mention = problemNumber.trim() ? `@${problemNumber.trim()}` : ""
  const body = (() => {
    switch (mode) {
      case "thoughtProcess":
        return "Förklara tankegången — hur man tänker steg för steg."
      case "normal":
        return "Hjälp mig med den här uppgiften."
    }
  })()
  return [mention, body].filter((part) => part.length > 0).join(" ")
}
