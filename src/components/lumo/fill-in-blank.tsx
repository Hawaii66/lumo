import { createElement, useEffect, useRef, useState } from "react"
import type { MathfieldElement } from "mathlive"
import type { FillBlankPart, PromptSpec } from "~/lib/lumo-content"
import { latexEquals } from "~/lib/latex-equals"
import { cn } from "~/lib/utils"

type PromptStatus = "neutral" | "correct" | "incorrect"

function statusStyles(status: "neutral" | "success" | "error") {
  if (status === "success") {
    return "border-green-500/60 bg-green-50 dark:bg-green-950/30"
  }
  if (status === "error") {
    return "border-red-500/60 bg-red-50 dark:bg-red-950/30"
  }
  return "border-border bg-background"
}

export type FillInBlankProps = {
  latex: string
  prompts: Array<PromptSpec>
  prompt?: string
  showPromptStatus?: boolean
  className?: string
  onAllCorrect?: () => void
}

export function FillInBlank({
  latex,
  prompts,
  prompt,
  showPromptStatus = true,
  className,
  onAllCorrect,
}: FillInBlankProps) {
  const fieldRef = useRef<MathfieldElement | null>(null)
  const onAllCorrectRef = useRef(onAllCorrect)
  onAllCorrectRef.current = onAllCorrect
  const [promptStatus, setPromptStatus] = useState<Record<string, PromptStatus>>(
    {},
  )
  const [allCorrect, setAllCorrect] = useState(false)

  useEffect(() => {
    setPromptStatus({})
    setAllCorrect(false)
    let cancelled = false

    void import("mathlive").then(() => {
      const el = fieldRef.current
      if (cancelled || !el) return
      el.readOnly = true
      el.value = latex
      for (const p of prompts) {
        el.setPromptState(p.id, undefined, false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [latex, prompts])

  useEffect(() => {
    const el = fieldRef.current
    if (!el) return

    const handleInput = () => {
      const nextStatus: Record<string, PromptStatus> = {}
      let correctCount = 0
      let answeredCount = 0

      for (const p of prompts) {
        const value = el.getPromptValue(p.id).trim()
        if (!value || value === "?" || value === "\\placeholder") {
          nextStatus[p.id] = "neutral"
          el.setPromptState(p.id, undefined, false)
          continue
        }

        answeredCount += 1
        const ok = latexEquals(value, p.answer)
        nextStatus[p.id] = ok ? "correct" : "incorrect"
        el.setPromptState(p.id, ok ? "correct" : "incorrect", ok)

        if (ok) correctCount += 1
      }

      setPromptStatus(nextStatus)
      const done =
        answeredCount === prompts.length && correctCount === prompts.length
      setAllCorrect(done)
      if (done) onAllCorrectRef.current?.()
    }

    el.addEventListener("input", handleInput)
    return () => el.removeEventListener("input", handleInput)
  }, [prompts])

  const overallStatus = allCorrect
    ? "success"
    : Object.values(promptStatus).some((s) => s === "incorrect")
      ? "error"
      : "neutral"

  return (
    <div className={cn("space-y-2", className)}>
      {prompt ? (
        <p className="text-sm text-muted-foreground">{prompt}</p>
      ) : null}

      <div
        className={cn(
          "rounded-lg border-2 p-4 transition-colors",
          statusStyles(overallStatus),
        )}
      >
        {createElement("math-field", {
          ref: fieldRef,
          className: "block w-full min-h-14 text-xl",
        })}
      </div>

      {showPromptStatus ? (
        <div className="space-y-1 text-sm">
          {prompts.map((p) => {
            const status = promptStatus[p.id] ?? "neutral"
            return (
              <p key={p.id} className="text-muted-foreground">
                <span className="font-mono text-xs">{p.id}</span>
                {": "}
                {status === "correct"
                  ? "korrekt"
                  : status === "incorrect"
                    ? "fel — prova igen"
                    : "fyll i luckan"}
              </p>
            )
          })}
        </div>
      ) : null}

      {allCorrect ? (
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          Rätt!
        </p>
      ) : null}
    </div>
  )
}

export function FillInBlankFromPart({
  part,
  ...rest
}: { part: FillBlankPart } & Omit<FillInBlankProps, "latex" | "prompts" | "prompt">) {
  return (
    <FillInBlank
      latex={part.latex}
      prompts={part.prompts}
      prompt={part.prompt}
      {...rest}
    />
  )
}
