export const MAX_FIELD_LENGTH = 50
export const MAX_GENERAL_INFO_LENGTH = 4000

export function formatDateTime(timestamp: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp))
}
