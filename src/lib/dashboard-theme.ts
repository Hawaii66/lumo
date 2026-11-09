export const DASHBOARD_THEMES = [
  "light",
  "dark",
  "purple",
  "ocean",
  "rose",
] as const

export type DashboardTheme = (typeof DASHBOARD_THEMES)[number]

export const DASHBOARD_THEME_LABELS: Record<DashboardTheme, string> = {
  light: "Ljus",
  dark: "Mörk",
  purple: "Lila",
  ocean: "Hav",
  rose: "Rosé",
}

export const DEFAULT_DASHBOARD_THEME: DashboardTheme = "light"

export const DASHBOARD_THEME_STORAGE_KEY = "lumo-dashboard-theme"

const dashboardThemeListeners = new Set<() => void>()

export function isDashboardTheme(value: unknown): value is DashboardTheme {
  return (
    typeof value === "string" &&
    (DASHBOARD_THEMES as readonly string[]).includes(value)
  )
}

/** Same-device paint cache; Convex remains source of truth. */
export function readStoredDashboardTheme(): DashboardTheme | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY)
    return isDashboardTheme(raw) ? raw : null
  } catch {
    return null
  }
}

export function writeStoredDashboardTheme(theme: DashboardTheme): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, theme)
  } catch {
    // ignore quota / private mode
  }
  dashboardThemeListeners.forEach((listener) => listener())
}

export function resolveDashboardTheme(): DashboardTheme {
  return readStoredDashboardTheme() ?? DEFAULT_DASHBOARD_THEME
}

/** Lets React re-commit after hydration when SSR default ≠ localStorage. */
export function subscribeDashboardTheme(onStoreChange: () => void): () => void {
  dashboardThemeListeners.add(onStoreChange)
  return () => {
    dashboardThemeListeners.delete(onStoreChange)
  }
}

export function getServerDashboardTheme(): DashboardTheme {
  return DEFAULT_DASHBOARD_THEME
}

/** Themes that need the `.dark` class for `dark:` Tailwind utilities. */
export function isDarkTheme(theme: DashboardTheme): boolean {
  return theme !== "light"
}
