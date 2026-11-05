import { createContext, useContext, type ReactNode } from "react"
import type { HomeAppearance } from "~/lib/home-appearance"

type HomeAppearanceContextValue = {
  appearance: HomeAppearance
  toggleAppearance: () => void
}

const HomeAppearanceContext = createContext<HomeAppearanceContextValue | null>(
  null,
)

export function HomeAppearanceProvider({
  appearance,
  toggleAppearance,
  children,
}: HomeAppearanceContextValue & { children: ReactNode }) {
  return (
    <HomeAppearanceContext.Provider value={{ appearance, toggleAppearance }}>
      {children}
    </HomeAppearanceContext.Provider>
  )
}

export function useHomeAppearanceContext(): HomeAppearanceContextValue {
  const value = useContext(HomeAppearanceContext)
  if (value === null) {
    throw new Error(
      "useHomeAppearanceContext must be used within HomeAppearanceShell",
    )
  }
  return value
}
