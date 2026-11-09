import { useQuery } from "convex/react"
import { type ReactNode, useEffect, useSyncExternalStore } from "react"
import { api } from "../../../convex/_generated/api"
import {
  getServerDashboardTheme,
  isDarkTheme,
  isDashboardTheme,
  resolveDashboardTheme,
  subscribeDashboardTheme,
  writeStoredDashboardTheme,
} from "~/lib/dashboard-theme"
import { cn } from "~/lib/utils"

type DashboardThemeShellProps = {
  children: ReactNode
}

export function DashboardThemeShell({ children }: DashboardThemeShellProps) {
  const viewer = useQuery(api.users.viewer)
  const cachedTheme = useSyncExternalStore(
    subscribeDashboardTheme,
    resolveDashboardTheme,
    getServerDashboardTheme,
  )
  const theme = viewer?.theme ?? cachedTheme

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
      suppressHydrationWarning
    >
      {children}
    </div>
  )
}
