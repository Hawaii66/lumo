export const HOME_APPEARANCE_STORAGE_KEY = "lumo-home-appearance"

export type HomeAppearance = "light" | "dark"

export function isHomeAppearance(value: unknown): value is HomeAppearance {
  return value === "light" || value === "dark"
}

export function getSystemHomeAppearance(): HomeAppearance {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

/** Explicit choice from storage, or `null` to follow the browser. */
export function readStoredHomeAppearance(): HomeAppearance | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(HOME_APPEARANCE_STORAGE_KEY)
    return isHomeAppearance(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredHomeAppearance(appearance: HomeAppearance): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(HOME_APPEARANCE_STORAGE_KEY, appearance)
  } catch {
    // ignore quota / private mode
  }
}

export function resolveHomeAppearance(): HomeAppearance {
  return readStoredHomeAppearance() ?? getSystemHomeAppearance()
}
