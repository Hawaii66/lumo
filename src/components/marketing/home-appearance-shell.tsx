import type { ReactNode } from "react"
import { useHomeAppearance } from "~/hooks/use-home-appearance"
import { cn } from "~/lib/utils"
import { HomeAppearanceProvider } from "~/components/marketing/home-appearance-context"

type HomeAppearanceShellProps = {
  children: ReactNode
}

export function HomeAppearanceShell({ children }: HomeAppearanceShellProps) {
  const { appearance, toggleAppearance } = useHomeAppearance()

  return (
    <HomeAppearanceProvider
      appearance={appearance}
      toggleAppearance={toggleAppearance}
    >
      <div
        data-home-appearance={appearance}
        className={cn(
          "min-h-svh bg-background text-foreground",
          appearance === "dark" && "dark",
        )}
        style={{ colorScheme: appearance }}
        suppressHydrationWarning
      >
        {children}
      </div>
    </HomeAppearanceProvider>
  )
}
