import { createElement, useCallback, useEffect, useRef, useState } from "react"
import type { MathfieldElement } from "mathlive"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { latexEquals } from "~/lib/latex-equals"
import { cn } from "~/lib/utils"

type PromptSpec = {
  id: string
  answer: string
}

type Exercise = {
  id: string
  title: string
  prompt: string
  latex: string
  prompts: PromptSpec[]
}

type PromptStatus = "neutral" | "correct" | "incorrect"

const EXERCISES: Exercise[] = [
  {
    id: "move-term",
    title: "Flytta över termen",
    prompt: "Förenkla genom att flytta över 5. Vad blir högerledet?",
    latex: "2x + 5 = 11 \\Rightarrow 2x = \\placeholder[target]{}",
    prompts: [{ id: "target", answer: "6" }],
  },
  {
    id: "derivative",
    title: "Inre derivatan",
    prompt: "Om u = x^2 + 1, vad blir du/dx?",
    latex: "\\frac{du}{dx} = \\placeholder[answer]{}",
    prompts: [{ id: "answer", answer: "2x" }],
  },
  {
    id: "fraction",
    title: "Förenkla bråket",
    prompt: "Fyll i täljare och nämnare i förkortad form.",
    latex:
      "\\frac{15}{12} = \\frac{\\placeholder[numerator]{}}{\\placeholder[denominator]{}}",
    prompts: [
      { id: "numerator", answer: "5" },
      { id: "denominator", answer: "4" },
    ],
  },
]

function statusStyles(status: "neutral" | "success" | "error") {
  if (status === "success") {
    return "border-green-500/60 bg-green-50 dark:bg-green-950/30"
  }
  if (status === "error") {
    return "border-red-500/60 bg-red-50 dark:bg-red-950/30"
  }
  return "border-border bg-background"
}

export function FillInBlankDemo() {
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id)
  const exercise = EXERCISES.find((item) => item.id === exerciseId) ?? EXERCISES[0]

  const fieldRef = useRef<MathfieldElement | null>(null)
  const [promptStatus, setPromptStatus] = useState<Record<string, PromptStatus>>(
    {},
  )
  const [allCorrect, setAllCorrect] = useState(false)

  const resetState = useCallback(() => {
    setPromptStatus({})
    setAllCorrect(false)
  }, [])

  useEffect(() => {
    resetState()
    let cancelled = false

    void import("mathlive").then(() => {
      const el = fieldRef.current
      if (cancelled || !el) return
      el.readOnly = true
      el.value = exercise.latex
      for (const prompt of exercise.prompts) {
        el.setPromptState(prompt.id, undefined, false)
      }
    })

    return () => {
      cancelled = true
    }
  }, [exercise, resetState])

  useEffect(() => {
    const el = fieldRef.current
    if (!el) return

    const handleInput = () => {
      const nextStatus: Record<string, PromptStatus> = {}
      let correctCount = 0
      let answeredCount = 0

      for (const prompt of exercise.prompts) {
        const value = el.getPromptValue(prompt.id).trim()
        if (!value || value === "?" || value === "\\placeholder") {
          nextStatus[prompt.id] = "neutral"
          el.setPromptState(prompt.id, undefined, false)
          continue
        }

        answeredCount += 1
        const ok = latexEquals(value, prompt.answer)
        nextStatus[prompt.id] = ok ? "correct" : "incorrect"
        el.setPromptState(prompt.id, ok ? "correct" : "incorrect", ok)

        if (ok) correctCount += 1
      }

      setPromptStatus(nextStatus)
      setAllCorrect(
        answeredCount === exercise.prompts.length &&
          correctCount === exercise.prompts.length,
      )
    }

    el.addEventListener("input", handleInput)
    return () => el.removeEventListener("input", handleInput)
  }, [exercise])

  const overallStatus = allCorrect
    ? "success"
    : Object.values(promptStatus).some((s) => s === "incorrect")
      ? "error"
      : "neutral"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Luckformel (fill-in-the-blank)</CardTitle>
        <CardDescription>
          Readonly MathLive med{" "}
          <code className="font-mono text-xs">\placeholder[id]{"{}"}</code> —
          svar valideras med Compute Engine
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {EXERCISES.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={exerciseId === item.id ? "default" : "outline"}
              onClick={() => setExerciseId(item.id)}
            >
              {item.title}
            </Button>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">{exercise.prompt}</p>

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

        <div className="space-y-1 text-sm">
          {exercise.prompts.map((prompt) => {
            const status = promptStatus[prompt.id] ?? "neutral"
            return (
              <p key={prompt.id} className="text-muted-foreground">
                <span className="font-mono text-xs">{prompt.id}</span>
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

        {allCorrect ? (
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Rätt! Nästa steg kan låsas upp.
          </p>
        ) : null}

        <p className="font-mono text-xs break-all text-muted-foreground">
          {exercise.latex}
        </p>
      </CardContent>
    </Card>
  )
}
