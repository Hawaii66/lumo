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
      "border-0 bg-transparent p-0 text-foreground shadow-none",
      display === "inline"
        ? "inline-block min-h-[1.5em] text-[1em]"
        : "block w-full min-h-[2.5em] text-[1.125em]",
      className,
    ),
  })
}
