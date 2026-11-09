import { useQuery } from "convex/react"
import { useRouteContext } from "@tanstack/react-router"
import { type ReactNode, useEffect } from "react"
import { api } from "../../../convex/_generated/api"
import {
  isDarkTheme,
  isDashboardTheme,
  writeStoredDashboardTheme,
} from "~/lib/dashboard-theme"
import { cn } from "~/lib/utils"

type DashboardThemeShellProps = {
  children: ReactNode
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
