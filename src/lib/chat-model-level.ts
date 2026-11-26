export const CHAT_MODEL_LEVELS = [1, 2, 3] as const

export type ChatModelLevel = (typeof CHAT_MODEL_LEVELS)[number]

export const DEFAULT_CHAT_MODEL_LEVEL: ChatModelLevel = 1

export type ChatModelLevelConfig = {
  level: ChatModelLevel
  name: string
  modelId: string
  creditCost: number
}

/** Client fallback when creditConfig has no chatModelLevels yet. */
export const FALLBACK_CHAT_MODEL_LEVELS: Array<ChatModelLevelConfig> = [
  {
    level: 1,
    name: "Snabb",
    modelId: "openai/gpt-4.1-mini",
    creditCost: 1,
  },
  {
    level: 2,
    name: "Smart",
    modelId: "anthropic/claude-sonnet-4.5",
    creditCost: 2,
  },
  {
    level: 3,
    name: "Pro",
    modelId: "anthropic/claude-opus-4.5",
    creditCost: 4,
  },
]

export function normalizeChatModelLevel(
  value: number | null | undefined,
): ChatModelLevel {
  if (value === 1 || value === 2 || value === 3) return value
  return DEFAULT_CHAT_MODEL_LEVEL
}

export function resolveChatModelLevels(
  levels: Array<ChatModelLevelConfig> | null | undefined,
): Array<ChatModelLevelConfig> {
  if (levels !== undefined && levels !== null && levels.length === 3) {
    const byLevel = new Map(levels.map((entry) => [entry.level, entry]))
    if (byLevel.has(1) && byLevel.has(2) && byLevel.has(3)) {
      return CHAT_MODEL_LEVELS.map((level) => byLevel.get(level)!)
    }
  }
  return FALLBACK_CHAT_MODEL_LEVELS
}

export function chatModelLevelLabel(
  levels: Array<ChatModelLevelConfig>,
  level: ChatModelLevel,
): string {
  const entry = levels.find((row) => row.level === level)
  if (entry === undefined) return `Nivå ${level}`
  return `${entry.name} ${entry.creditCost}`
}
