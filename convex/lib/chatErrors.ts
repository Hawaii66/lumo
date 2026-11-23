import { INSUFFICIENT_CREDITS_CODE } from "./credits";

/** Default copy when we cannot classify the failure. */
export const GENERIC_CHAT_ERROR =
  "Kunde inte generera svar just nu. Försök igen om en stund.";

/**
 * Map raw provider / platform error text to a short Swedish message for the
 * chat UI (failed assistant turns, OpenRouter, app credits, etc.).
 */
export function userFacingChatError(raw: unknown): string {
  const text = extractErrorText(raw);
  if (text.length === 0) return GENERIC_CHAT_ERROR;

  const lower = text.toLowerCase();

  if (
    text.includes(INSUFFICIENT_CREDITS_CODE) ||
    lower.includes("insufficient_credits")
  ) {
    const afterCode = text
      .replace(/^[\s\S]*?INSUFFICIENT_CREDITS:\s*/i, "")
      .trim();
    if (afterCode.length > 0 && !/^\[CONVEX/i.test(afterCode)) {
      return stripConvexWrapper(afterCode);
    }
    return "Du har slut på credits. Toppa upp eller vänta till morgondagens free credits.";
  }

  if (
    /\b402\b/.test(text) ||
    lower.includes("insufficient credits") ||
    lower.includes("payment required") ||
    lower.includes("exceed your available credits") ||
    lower.includes("requires more credits")
  ) {
    return "AI-leverantören har slut på credits just nu. Försök igen senare.";
  }

  if (
    /\b401\b/.test(text) ||
    lower.includes("api key expired") ||
    lower.includes("invalid api key") ||
    lower.includes("user not found") ||
    lower.includes("missing authentication") ||
    lower.includes("no api key") ||
    lower.includes("unauthorized") ||
    lower.includes("authentication")
  ) {
    return "AI-anslutningen är ogiltig eller har gått ut. Kontakta support om felet kvarstår.";
  }

  if (
    /\b429\b/.test(text) ||
    lower.includes("rate limit") ||
    lower.includes("too many requests")
  ) {
    return "För många förfrågningar just nu. Vänta en stund och försök igen.";
  }

  if (
    /\b403\b/.test(text) ||
    lower.includes("moderation") ||
    lower.includes("forbidden") ||
    lower.includes("permission_denied")
  ) {
    return "Förfrågan blockerades. Prova att omformulera meddelandet.";
  }

  if (
    /\b408\b/.test(text) ||
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("deadline")
  ) {
    return "Svaret tog för lång tid. Försök igen.";
  }

  if (
    /\b5\d\d\b/.test(text) ||
    lower.includes("internal server error") ||
    lower.includes("service unavailable") ||
    lower.includes("bad gateway")
  ) {
    return "AI-tjänsten har tillfälliga problem. Försök igen om en stund.";
  }

  const cleaned = stripConvexWrapper(text);
  if (cleaned.length > 0 && cleaned.length <= 220 && !looksTechnical(cleaned)) {
    return cleaned;
  }

  return GENERIC_CHAT_ERROR;
}

function extractErrorText(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw instanceof Error) return raw.message.trim();
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    if (typeof record.message === "string") return record.message.trim();
    if (typeof record.error === "string") return record.error.trim();
  }
  return "";
}

/** Strip `[CONVEX M(...)] … Uncaught Error:` wrappers from client Error.message. */
export function stripConvexWrapper(message: string): string {
  let text = message.trim();
  text = text.replace(/^\[CONVEX[^\]]*\]\s*/i, "");
  text = text.replace(/^\[Request ID:[^\]]*\]\s*/i, "");
  text = text.replace(/^Server Error\s*/i, "");
  text = text.replace(/^Uncaught (?:Convex)?Error:\s*/i, "");
  text = text.replace(/^Error:\s*/i, "");
  // Nested Convex wrappers occasionally appear twice.
  text = text.replace(/^\[CONVEX[^\]]*\]\s*/i, "");
  text = text.replace(/^Uncaught (?:Convex)?Error:\s*/i, "");
  return text.trim();
}

function looksTechnical(text: string): boolean {
  return (
    /AI_APICallError|at <anonymous>|node_modules|stack trace|TypeError|ECONNREFUSED/i.test(
      text,
    ) || text.includes("\n")
  );
}
