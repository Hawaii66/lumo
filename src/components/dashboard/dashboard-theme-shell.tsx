import { useQuery } from "convex/react"
import type { ReactNode } from "react"
import { api } from "../../../convex/_generated/api"
import {
  DEFAULT_DASHBOARD_THEME,
  isDarkTheme,
} from "~/lib/dashboard-theme"
import { cn } from "~/lib/utils"

type DashboardThemeShellProps = {
  children: ReactNode
}

export function DashboardThemeShell({ children }: DashboardThemeShellProps) {
  const viewer = useQuery(api.users.viewer)
  const theme = viewer?.theme ?? DEFAULT_DASHBOARD_THEME

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
