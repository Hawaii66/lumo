/** Seeded into `creditConfig` when the singleton row is missing. */
export const DEFAULT_FREE_DAILY_CREDITS = 30;
export const DEFAULT_CHAT_CREDIT_COST = 1;
export const DEFAULT_TWIN_CREDIT_COST = 5;

/** Debug top-up pack sizes (Stripe packs later). */
export const DEBUG_TOP_UP_AMOUNTS = [100, 200, 500] as const;
export type DebugTopUpAmount = (typeof DEBUG_TOP_UP_AMOUNTS)[number];

export const CREDIT_CONFIG_KEY = "default" as const;

/** Stable prefix so clients can detect paywall failures. */
export const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";

export function insufficientCreditsError(available: number, needed: number) {
  return new Error(
    `${INSUFFICIENT_CREDITS_CODE}: Du har ${available} credits kvar men behöver ${needed}. Toppa upp eller vänta till morgondagens free credits.`,
  );
}

/** Pricing from the creditConfig singleton (chat/twin costs). */
export type CreditConfigValues = {
  chatCreditCost: number;
  twinCreditCost: number;
};

/** Per-user costs shown on balance: pricing + role free daily grant. */
export type UserCreditCosts = CreditConfigValues & {
  freeDailyCredits: number;
};

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
