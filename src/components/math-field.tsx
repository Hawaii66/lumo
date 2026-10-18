import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react"
import type { MathfieldElement } from "mathlive"
import { cn } from "~/lib/utils"

export type MathFieldHandle = {
  focus: () => void
}

type MathFieldProps = {
  value?: string
  onChange?: (value: string) => void
  /** Called when Enter is pressed (Shift+Enter is ignored). */
  onEnter?: () => void
  readOnly?: boolean
  className?: string
  autoFocus?: boolean
}

export const MathField = forwardRef<MathFieldHandle, MathFieldProps>(
  function MathField(
    {
      value = "",
      onChange,
      onEnter,
      readOnly = false,
      className,
      autoFocus = false,
    },
    forwardedRef,
  ) {
    const ref = useRef<MathfieldElement | null>(null)

    useImperativeHandle(forwardedRef, () => ({
      focus: () => {
        const el = ref.current
        if (!el) return
        el.focus()
      },
    }))

    useEffect(() => {
      let cancelled = false

      void import("mathlive").then(() => {
        if (cancelled || !ref.current) return
        ref.current.value = value
        ref.current.readOnly = readOnly
        if (autoFocus) {
          // Wait a tick so the dialog portal is fully mounted.
          requestAnimationFrame(() => {
            ref.current?.focus()
          })
        }
      })

      return () => {
        cancelled = true
      }
      // Mount-only: sync value/readOnly in dedicated effects below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
      if (!autoFocus) return
      const id = window.setTimeout(() => {
        ref.current?.focus()
      }, 50)
      return () => window.clearTimeout(id)
    }, [autoFocus])

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

    useEffect(() => {
      const el = ref.current
      if (!el || !onEnter) return

      const handleKeyDown = (event: Event) => {
        const keyEvent = event as KeyboardEvent
        if (keyEvent.key !== "Enter" || keyEvent.shiftKey) return
        keyEvent.preventDefault()
        keyEvent.stopPropagation()
        onEnter()
      }

      // Capture so MathLive does not consume Enter before we see it.
      el.addEventListener("keydown", handleKeyDown, true)
      return () => el.removeEventListener("keydown", handleKeyDown, true)
    }, [onEnter])

    return createElement("math-field", {
      ref,
      className: cn(
        "block w-full rounded-lg border border-input bg-background px-3 py-2 text-base shadow-xs",
        className,
      ),
    })
  },
)
