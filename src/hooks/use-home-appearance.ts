import { useEffect, useState } from "react"
import {
  getSystemHomeAppearance,
  type HomeAppearance,
  readStoredHomeAppearance,
  resolveHomeAppearance,
  writeStoredHomeAppearance,
} from "~/lib/home-appearance"

export function useHomeAppearance() {
  const [appearance, setAppearance] = useState<HomeAppearance>(() =>
    resolveHomeAppearance(),
  )

  useEffect(() => {
    setAppearance(resolveHomeAppearance())

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onSystemChange = () => {
      if (readStoredHomeAppearance() !== null) return
      setAppearance(getSystemHomeAppearance())
    }

    media.addEventListener("change", onSystemChange)
    return () => media.removeEventListener("change", onSystemChange)
  }, [])

  function toggleAppearance() {
    const next: HomeAppearance = appearance === "dark" ? "light" : "dark"
    writeStoredHomeAppearance(next)
    setAppearance(next)
  }

  return { appearance, toggleAppearance }
}
