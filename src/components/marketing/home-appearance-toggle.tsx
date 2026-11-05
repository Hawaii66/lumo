import { Moon, Sun } from "lucide-react"
import { useHomeAppearanceContext } from "~/components/marketing/home-appearance-context"
import { Button } from "~/components/ui/button"

export function HomeAppearanceToggle() {
  const { appearance, toggleAppearance } = useHomeAppearanceContext()
  const isDark = appearance === "dark"

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      aria-label={isDark ? "Byt till ljust läge" : "Byt till mörkt läge"}
      title={isDark ? "Ljust läge" : "Mörkt läge"}
      className="border-primary/40 bg-transparent text-primary hover:bg-primary/10 hover:text-primary"
      onClick={toggleAppearance}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  )
}
