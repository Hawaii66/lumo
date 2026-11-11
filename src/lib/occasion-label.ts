/** "Lektion 3 (30/11)" from name + YYYY-MM-DD. */
export function formatOccasionLabel(name: string, date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (match === null) return name
  const day = Number(match[3])
  const month = Number(match[2])
  return `${name} (${day}/${month})`
}

export function unitKey(
  contentHash: string,
  problemNumber: string,
  subproblemLetter: string,
): string {
  return `${contentHash}\0${problemNumber}\0${subproblemLetter}`
}
