import { useMutation, useQuery } from "convex/react"
import { useRouteContext } from "@tanstack/react-router"
import { api } from "../../../convex/_generated/api"
import {
  DASHBOARD_THEMES,
  DASHBOARD_THEME_LABELS,
  type DashboardTheme,
  isDashboardTheme,
  writeStoredDashboardTheme,
} from "~/lib/dashboard-theme"
import { cn } from "~/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"

type ThemeSelectorProps = {
  className?: string
}

export function ThemeSelector({ className }: ThemeSelectorProps) {
  const { dashboardTheme: cookieTheme } = useRouteContext({ from: "__root__" })
  const viewer = useQuery(api.users.viewer)
  const updateTheme = useMutation(api.users.updateTheme)
  const theme = viewer?.theme ?? cookieTheme
  const disabled = viewer === undefined

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      role="group"
      aria-label="Tema"
    >
      <span className="text-xs font-medium text-muted-foreground">Tema</span>
      <Select
        value={theme}
        items={DASHBOARD_THEME_LABELS}
        disabled={disabled}
        onValueChange={(next) => {
          if (!isDashboardTheme(next)) return
          writeStoredDashboardTheme(next)
          void updateTheme({ theme: next })
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Välj tema"
          className="h-7 min-w-24 border-border bg-background px-2 text-xs font-medium"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {DASHBOARD_THEMES.map((value: DashboardTheme) => (
            <SelectItem key={value} value={value}>
              {DASHBOARD_THEME_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
