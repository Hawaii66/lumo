import { useState } from "react"

const HEJ_PHRASES = [
  "Hej",
  "Tjena",
  "Hejsan",
  "Hallå",
  "Tja",
  "Halloj",
  "Tjo",
  "Goddag",
] as const

let sessionPhrase: string | null = null

function pickHejPhrase(): string {
  if (sessionPhrase == null) {
    sessionPhrase =
      HEJ_PHRASES[Math.floor(Math.random() * HEJ_PHRASES.length)] ?? "Hej"
  }
  return sessionPhrase
}

/** Stable random Swedish greeting for the current page session. */
export function useHejPhrase(): string {
  const [phrase] = useState(pickHejPhrase)
  return phrase
}
