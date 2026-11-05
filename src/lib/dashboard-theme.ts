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

export function isDashboardTheme(value: unknown): value is DashboardTheme {
  return (
    typeof value === "string" &&
    (DASHBOARD_THEMES as readonly string[]).includes(value)
  )
}

/** Themes that need the `.dark` class for `dark:` Tailwind utilities. */
export function isDarkTheme(theme: DashboardTheme): boolean {
  return theme !== "light"
}
