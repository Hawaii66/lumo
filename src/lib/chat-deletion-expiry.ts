export const CHAT_DELETION_EXPIRIES = [
  {
    value: "1h",
    label: "1 timme",
    description: "Chatten arkiveras efter 1 timme",
  },
  {
    value: "3h",
    label: "3 timmar",
    description: "Chatten arkiveras efter 3 timmar",
  },
  {
    value: "infinite",
    label: "Aldrig",
    description: "Chatten behålls tills du arkiverar den",
  },
] as const

export type ChatDeletionExpiry =
  (typeof CHAT_DELETION_EXPIRIES)[number]["value"]

export const DEFAULT_CHAT_DELETION_EXPIRY: ChatDeletionExpiry = "infinite"
export const PROBLEM_CHAT_DELETION_EXPIRY: ChatDeletionExpiry = "3h"

export function isChatDeletionExpiry(
  value: string,
): value is ChatDeletionExpiry {
  return CHAT_DELETION_EXPIRIES.some((item) => item.value === value)
}

export function chatDeletionExpiryLabel(
  expiry: ChatDeletionExpiry,
): string {
  return (
    CHAT_DELETION_EXPIRIES.find((item) => item.value === expiry)?.label ??
    expiry
  )
}

/** Live countdown for the closed dropdown trigger (timed chats only). */
export function formatTimeUntilDelete(
  deleteAt: number,
  now = Date.now(),
): string {
  const remainingMs = deleteAt - now
  if (remainingMs <= 0) return "snart"

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return `om ${hours}t ${minutes}m`
  }
  return `om ${minutes}m`
}

/** Compact remaining-time label for the room sidebar chat list. */
export function formatSidebarTimeLeft(
  deleteAt: number,
  now = Date.now(),
): string {
  const remainingMs = deleteAt - now
  if (remainingMs <= 0) return "snart"

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m kvar` : `${hours}h kvar`
  }
  return `${minutes}m kvar`
}

/** Closed-dropdown label: countdown when timed, otherwise the expiry option label. */
export function deletionExpiryTriggerLabel(
  expiry: ChatDeletionExpiry,
  deleteAt: number | null | undefined,
  now = Date.now(),
): string {
  if (expiry === "infinite" || deleteAt == null) {
    return chatDeletionExpiryLabel("infinite")
  }
  return formatTimeUntilDelete(deleteAt, now)
}
