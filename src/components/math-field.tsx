import { createElement, useEffect, useRef } from "react"
import type { MathfieldElement } from "mathlive"
import { cn } from "~/lib/utils"

type MathFieldProps = {
  value?: string
  onChange?: (value: string) => void
  readOnly?: boolean
  className?: string
}

export function MathField({
  value = "",
  onChange,
  readOnly = false,
  className,
}: MathFieldProps) {
  const ref = useRef<MathfieldElement | null>(null)

  useEffect(() => {
    let cancelled = false

    void import("mathlive").then(() => {
      if (cancelled || !ref.current) return
      ref.current.value = value
      ref.current.readOnly = readOnly
    })

    return () => {
      cancelled = true
    }
    // Mount-only: sync value/readOnly in dedicated effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.value !== value) {
      el.value = value
    }
  }, [value])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.readOnly = readOnly
  }, [readOnly])

  useEffect(() => {
    const el = ref.current
    if (!el || !onChange) return

    const handleInput = () => {
      onChange(el.value)
    }

    el.addEventListener("input", handleInput)
    return () => el.removeEventListener("input", handleInput)
  }, [onChange])

  return createElement("math-field", {
    ref,
    className: cn(
      "block w-full rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs",
      className,
    ),
  })
}
