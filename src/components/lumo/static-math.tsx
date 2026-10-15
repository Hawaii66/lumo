import { createElement, useEffect, useRef } from "react"
import type { MathfieldElement } from "mathlive"
import { cn } from "~/lib/utils"

type StaticMathProps = {
  latex: string
  className?: string
  display?: "inline" | "block"
}

export function StaticMath({
  latex,
  className,
  display = "block",
}: StaticMathProps) {
  const ref = useRef<MathfieldElement | null>(null)

  useEffect(() => {
    let cancelled = false
    void import("mathlive").then(() => {
      const el = ref.current
      if (cancelled || !el) return
      el.readOnly = true
      el.value = latex
    })
    return () => {
      cancelled = true
    }
  }, [latex])

  return createElement("math-field", {
    ref,
    className: cn(
      display === "inline" ? "inline-block min-h-6 text-base" : "block w-full min-h-10 text-lg",
      className,
    ),
  })
}
