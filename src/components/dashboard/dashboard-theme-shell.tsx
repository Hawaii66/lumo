import { useQuery } from "convex/react"
import { useRouteContext } from "@tanstack/react-router"
import { type ReactNode, useEffect } from "react"
import { api } from "../../../convex/_generated/api"
import {
  type DashboardTheme,
  isDarkTheme,
  isDashboardTheme,
  writeStoredDashboardTheme,
} from "~/lib/dashboard-theme"
import { cn } from "~/lib/utils"

type DashboardThemeShellProps = {
  children: ReactNode
}

/** Keep documentElement in sync so portaled UI (dialogs, sheets, menus) inherits theme tokens. */
function applyThemeToDocument(theme: DashboardTheme) {
  const root = document.documentElement
  root.setAttribute("data-theme", theme)
  root.classList.toggle("dark", isDarkTheme(theme))
}

function clearThemeFromDocument() {
  const root = document.documentElement
  root.removeAttribute("data-theme")
  root.classList.remove("dark")
}

export function DashboardThemeShell({ children }: DashboardThemeShellProps) {
  const { dashboardTheme: cookieTheme } = useRouteContext({ from: "__root__" })
  const viewer = useQuery(api.users.viewer)
  const theme = viewer?.theme ?? cookieTheme

  useEffect(() => {
    if (viewer?.theme !== undefined && isDashboardTheme(viewer.theme)) {
      writeStoredDashboardTheme(viewer.theme)
    }
  }, [viewer?.theme])

  useEffect(() => {
    applyThemeToDocument(theme)
    return () => {
      clearThemeFromDocument()
    }
  }, [theme])

  return (
    <div
      data-theme={theme}
      className={cn(
        "min-h-svh bg-background text-foreground",
        isDarkTheme(theme) && "dark",
      )}
    >
      {children}
    </div>
  )
}
