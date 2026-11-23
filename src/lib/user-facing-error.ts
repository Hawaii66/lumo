import { ConvexError } from "convex/values"
import {
  GENERIC_CHAT_ERROR,
  stripConvexWrapper,
  userFacingChatError,
} from "../../convex/lib/chatErrors"
import { INSUFFICIENT_CREDITS_CODE } from "../../convex/lib/credits"

/**
 * Turn a mutation/action failure into short Swedish copy for the composer.
 * Prefer ConvexError.data when present; otherwise classify wrapped Error text.
 */
export function formatUserFacingError(
  err: unknown,
  fallback = GENERIC_CHAT_ERROR,
): string {
  if (err instanceof ConvexError) {
    const data = err.data
    if (typeof data === "string" && data.trim().length > 0) {
      return userFacingChatError(data)
    }
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const record = data as Record<string, unknown>
      const code = typeof record.code === "string" ? record.code : ""
      const message =
        typeof record.message === "string" ? record.message.trim() : ""
      if (code === INSUFFICIENT_CREDITS_CODE) {
        return (
          message ||
          "Du har slut på credits. Toppa upp eller vänta till morgondagens free credits."
        )
      }
      if (message.length > 0) return userFacingChatError(message)
    }
  }

  if (err instanceof Error && err.message.trim().length > 0) {
    return userFacingChatError(stripConvexWrapper(err.message))
  }

  if (typeof err === "string" && err.trim().length > 0) {
    return userFacingChatError(err)
  }

  return fallback
}
