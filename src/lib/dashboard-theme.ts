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

/** Sent on every request so SSR can paint the correct theme. */
export const DASHBOARD_THEME_COOKIE_NAME = "lumo-dashboard-theme"

const DASHBOARD_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isDashboardTheme(value: unknown): value is DashboardTheme {
  return (
    typeof value === "string" &&
    (DASHBOARD_THEMES as readonly string[]).includes(value)
  )
}

export function parseDashboardThemeCookie(
  value: string | undefined,
): DashboardTheme | null {
  return isDashboardTheme(value) ? value : null
}

/** Client-side cookie read. Prefer SSR loader data for first paint. */
export function readStoredDashboardTheme(): DashboardTheme | null {
  if (typeof document === "undefined") return null
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${DASHBOARD_THEME_COOKIE_NAME}=([^;]*)`),
    )
    const raw = match?.[1] ? decodeURIComponent(match[1]) : undefined
    return parseDashboardThemeCookie(raw)
  } catch {
    return null
  }
}

export function writeStoredDashboardTheme(theme: DashboardTheme): void {
  if (typeof document === "undefined") return
  try {
    document.cookie = `${DASHBOARD_THEME_COOKIE_NAME}=${encodeURIComponent(theme)}; path=/; max-age=${DASHBOARD_THEME_COOKIE_MAX_AGE}; SameSite=Lax`
  } catch {
    // ignore quota / private mode
  }
}

/** Themes that need the `.dark` class for `dark:` Tailwind utilities. */
export function isDarkTheme(theme: DashboardTheme): boolean {
  return theme !== "light"
}
