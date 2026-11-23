import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  DEFAULT_CHAT_MODEL_LEVEL,
  type ChatModelLevel,
} from "./lumoContent";

/** Seeded into `creditConfig` when the singleton row is missing. */
export const DEFAULT_FREE_DAILY_CREDITS = 30;
export const DEFAULT_CHAT_CREDIT_COST = 1;
export const DEFAULT_TWIN_CREDIT_COST = 5;

export type ChatModelLevelConfig = {
  level: ChatModelLevel;
  name: string;
  modelId: string;
  creditCost: number;
};

/** Default three-tier ladder (admin can change name / OpenRouter id / cost). */
export const DEFAULT_CHAT_MODEL_LEVELS: Array<ChatModelLevelConfig> = [
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
];

/** Debug top-up pack sizes (Stripe packs later). */
export const DEBUG_TOP_UP_AMOUNTS = [100, 200, 500] as const;
export type DebugTopUpAmount = (typeof DEBUG_TOP_UP_AMOUNTS)[number];

export const CREDIT_CONFIG_KEY = "default" as const;

/** Stable code so clients can detect paywall failures via ConvexError.data. */
export const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";

export function insufficientCreditsError(available: number, needed: number) {
  return new ConvexError({
    code: INSUFFICIENT_CREDITS_CODE,
    message: `Du har ${available} credits kvar men behöver ${needed}. Toppa upp eller vänta till morgondagens free credits.`,
  });
}

/** Pricing from the creditConfig singleton (chat/twin costs). */
export type CreditConfigValues = {
  chatCreditCost: number;
  twinCreditCost: number;
  chatModelLevels: Array<ChatModelLevelConfig>;
};

/** Per-user costs shown on balance: pricing + role free daily grant. */
export type UserCreditCosts = CreditConfigValues & {
  freeDailyCredits: number;
};

/** Normalize optional/legacy chatModelLevels into exactly three tiers. */
export function resolveChatModelLevels(
  config: Pick<Doc<"creditConfig">, "chatCreditCost" | "chatModelLevels">,
): Array<ChatModelLevelConfig> {
  const raw = config.chatModelLevels;
  if (raw !== undefined && raw.length === 3) {
    const byLevel = new Map(raw.map((entry) => [entry.level, entry]));
    if (byLevel.has(1) && byLevel.has(2) && byLevel.has(3)) {
      return [1, 2, 3].map((level) => {
        const entry = byLevel.get(level as ChatModelLevel)!;
        return {
          level: entry.level,
          name: entry.name,
          modelId: entry.modelId,
          creditCost: entry.creditCost,
        };
      });
    }
  }
  return [
    {
      ...DEFAULT_CHAT_MODEL_LEVELS[0]!,
      creditCost: config.chatCreditCost,
    },
    DEFAULT_CHAT_MODEL_LEVELS[1]!,
    DEFAULT_CHAT_MODEL_LEVELS[2]!,
  ];
}

export function resolveChatModelLevel(
  config: Pick<Doc<"creditConfig">, "chatCreditCost" | "chatModelLevels">,
  level: ChatModelLevel | undefined,
): ChatModelLevelConfig {
  const levels = resolveChatModelLevels(config);
  const target = level ?? DEFAULT_CHAT_MODEL_LEVEL;
  return levels.find((entry) => entry.level === target) ?? levels[0]!;
}

export function assertChatModelLevels(
  levels: Array<ChatModelLevelConfig>,
): Array<ChatModelLevelConfig> {
  if (levels.length !== 3) {
    throw new Error("chatModelLevels måste ha exakt 3 nivåer");
  }
  const seen = new Set<number>();
  for (const entry of levels) {
    if (seen.has(entry.level)) {
      throw new Error(`Duplicerad modellnivå: ${entry.level}`);
    }
    seen.add(entry.level);
    if (entry.name.trim().length === 0) {
      throw new Error(`Namn saknas för nivå ${entry.level}`);
    }
    if (entry.modelId.trim().length === 0) {
      throw new Error(`modelId saknas för nivå ${entry.level}`);
    }
    assertPositiveInt(`creditCost (nivå ${entry.level})`, entry.creditCost);
  }
  if (!seen.has(1) || !seen.has(2) || !seen.has(3)) {
    throw new Error("chatModelLevels måste innehålla nivåerna 1, 2 och 3");
  }
  return [1, 2, 3].map((level) => {
    const entry = levels.find((row) => row.level === level)!;
    return {
      level: entry.level,
      name: entry.name.trim(),
      modelId: entry.modelId.trim(),
      creditCost: entry.creditCost,
    };
  });
}

export function normalizeChatModelLevel(
  value: number | undefined,
): ChatModelLevel {
  if (value === 1 || value === 2 || value === 3) return value;
  return DEFAULT_CHAT_MODEL_LEVEL;
}

export type CreditLedgerKind =
  | "daily_grant"
  | "purchase"
  | "spend_chat"
  | "spend_twin"
  | "refund"
  | "admin_adjust";

/** Calendar date YYYY-MM-DD in Europe/Stockholm. */
export function stockholmDateString(now = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** Next midnight Europe/Stockholm as epoch ms (1-minute UI resolution). */
export function nextStockholmMidnightMs(now = Date.now()): number {
  const today = stockholmDateString(now);
  let t = now;
  const step = 15 * 60 * 1000;
  for (let i = 0; i < 96; i++) {
    t += step;
    if (stockholmDateString(t) !== today) {
      let lo = t - step;
      let hi = t;
      while (hi - lo > 60_000) {
        const mid = Math.floor((lo + hi) / 2);
        if (stockholmDateString(mid) === today) lo = mid;
        else hi = mid;
      }
      return hi;
    }
  }
  return now + 24 * 60 * 60 * 1000;
}

export function assertNonNegInt(name: string, value: number) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error(`${name} måste vara ett heltal ≥ 0`);
  }
}

export function assertPositiveInt(name: string, value: number) {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} måste vara ett heltal ≥ 1`);
  }
}

export function isDebugTopUpAmount(n: number): n is DebugTopUpAmount {
  return (DEBUG_TOP_UP_AMOUNTS as ReadonlyArray<number>).includes(n);
}
