import { createServerFn } from "@tanstack/react-start"
import { getCookie } from "@tanstack/react-start/server"
import {
  DASHBOARD_THEME_COOKIE_NAME,
  DEFAULT_DASHBOARD_THEME,
  parseDashboardThemeCookie,
  type DashboardTheme,
} from "~/lib/dashboard-theme"

/** Read theme cookie during SSR so first HTML has the right theme. */
export const getDashboardThemeServerFn = createServerFn({
  method: "GET",
}).handler((): DashboardTheme => {
  const raw = getCookie(DASHBOARD_THEME_COOKIE_NAME)
  return parseDashboardThemeCookie(raw) ?? DEFAULT_DASHBOARD_THEME
})
