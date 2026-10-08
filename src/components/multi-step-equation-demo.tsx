import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
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

type Step = {
  id: string
  title: string
  hint: string
  latex: string
  promptId: string
  answer: string
  /** LaTeX shown after the step is solved (answer filled in). */
  solvedLatex: string
}

const PROBLEM_LATEX = "3(x - 2) + 4 = 2x + 11"

const STEPS: Step[] = [
  {
    id: "expand",
    title: "Steg 1 — Expandera parentesen",
    hint: "Räkna ut 3(x − 2). Vad blir det?",
    latex: "3(x - 2) + 4 = 2x + 11 \\Rightarrow \\placeholder[expand]{} + 4 = 2x + 11",
    promptId: "expand",
    answer: "3x-6",
    solvedLatex: "3x - 6 + 4 = 2x + 11",
  },
  {
    id: "combine",
    title: "Steg 2 — Förenkla vänsterledet",
    hint: "Räkna ihop −6 + 4. Vad står kvar med 3x?",
    latex: "3x - 6 + 4 = 2x + 11 \\Rightarrow 3x \\placeholder[combine]{} = 2x + 11",
    promptId: "combine",
    answer: "-2",
    solvedLatex: "3x - 2 = 2x + 11",
  },
  {
    id: "isolate",
    title: "Steg 3 — Flytta över x-termer",
    hint: "Dra bort 2x från båda led. Vad blir det nya vänsterledet?",
    latex: "3x - 2 = 2x + 11 \\Rightarrow \\placeholder[left]{} = 11",
    promptId: "left",
    answer: "x-2",
    solvedLatex: "x - 2 = 11",
  },
  {
    id: "constant",
    title: "Steg 4 — Isolera x",
    hint: "Flytta över −2. Vad blir x?",
    latex: "x - 2 = 11 \\Rightarrow x = \\placeholder[solution]{}",
    promptId: "solution",
    answer: "13",
    solvedLatex: "x = 13",
  },
]

type StepState = "locked" | "active" | "correct" | "incorrect"

function borderFor(state: StepState) {
  if (state === "correct") {
    return "border-green-500/60 bg-green-50 dark:bg-green-950/30"
  }
  if (state === "incorrect") {
    return "border-red-500/60 bg-red-50 dark:bg-red-950/30"
  }
  if (state === "active") {
    return "border-primary/50 bg-background"
  }
  return "border-dashed border-border bg-muted/30"
}

function StaticMath({ latex, className }: { latex: string; className?: string }) {
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
    className: cn("block w-full min-h-10 text-lg", className),
  })
}

function ActiveStepField({
  step,
  onCorrect,
  onStatus,
}: {
  step: Step
  onCorrect: () => void
  onStatus: (status: "neutral" | "incorrect") => void
}) {
  const ref = useRef<MathfieldElement | null>(null)
  const onCorrectRef = useRef(onCorrect)
  const onStatusRef = useRef(onStatus)
  onCorrectRef.current = onCorrect
  onStatusRef.current = onStatus

  useEffect(() => {
    let cancelled = false
    void import("mathlive").then(() => {
      const el = ref.current
      if (cancelled || !el) return
      el.readOnly = true
      el.value = step.latex
      el.setPromptState(step.promptId, undefined, false)
    })
    return () => {
      cancelled = true
    }
  }, [step])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleInput = () => {
      const value = el.getPromptValue(step.promptId).trim()
      if (!value || value === "?") {
        el.setPromptState(step.promptId, undefined, false)
        onStatusRef.current("neutral")
        return
      }

      const ok = latexEquals(value, step.answer)
      el.setPromptState(step.promptId, ok ? "correct" : "incorrect", ok)
      if (ok) onCorrectRef.current()
      else onStatusRef.current("incorrect")
    }

    el.addEventListener("input", handleInput)
    return () => el.removeEventListener("input", handleInput)
  }, [step])

  return createElement("math-field", {
    ref,
    className: "block w-full min-h-14 text-xl",
  })
}

export function MultiStepEquationDemo() {
  const [unlockedIndex, setUnlockedIndex] = useState(0)
  const [stepFeedback, setStepFeedback] = useState<
    Record<string, "neutral" | "correct" | "incorrect">
  >({})
  const [finished, setFinished] = useState(false)
  const solvedRef = useRef<Set<string>>(new Set())

  const reset = () => {
    solvedRef.current = new Set()
    setUnlockedIndex(0)
    setStepFeedback({})
    setFinished(false)
  }

  const markCorrect = useCallback((index: number) => {
    const step = STEPS[index]
    if (solvedRef.current.has(step.id)) return
    solvedRef.current.add(step.id)

    setStepFeedback((prev) => ({ ...prev, [step.id]: "correct" }))

    if (index >= STEPS.length - 1) {
      setFinished(true)
      return
    }

    // Reveal next step after a short beat so the green state is visible.
    window.setTimeout(() => {
      setUnlockedIndex((current) => Math.max(current, index + 1))
    }, 350)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flerstegs ekvation</CardTitle>
        <CardDescription>
          Lös ekvationen steg för steg. Rätt svar låser upp nästa steg.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Uppgift
          </p>
          <StaticMath latex={PROBLEM_LATEX} />
          <p className="text-sm text-muted-foreground">
            Lös ekvationen och hitta x.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Steg {Math.min(unlockedIndex + 1, STEPS.length)} av {STEPS.length}
            {finished ? " — klart!" : null}
          </p>
          <div className="flex gap-1">
            {STEPS.map((step, index) => {
              const done = index < unlockedIndex || finished
              const active = index === unlockedIndex && !finished
              return (
                <span
                  key={step.id}
                  className={cn(
                    "h-2 w-6 rounded-full transition-colors",
                    done
                      ? "bg-green-500"
                      : active
                        ? "bg-primary"
                        : "bg-muted-foreground/25",
                  )}
                  title={step.title}
                />
              )
            })}
          </div>
        </div>

        <div className="space-y-3">
          {STEPS.map((step, index) => {
            if (index > unlockedIndex) {
              return (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-lg border-2 p-4 opacity-60",
                    borderFor("locked"),
                  )}
                >
                  <p className="text-sm font-medium text-muted-foreground">
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Låst — lös föregående steg först.
                  </p>
                </div>
              )
            }

            const isSolved =
              index < unlockedIndex ||
              (finished && index === STEPS.length - 1) ||
              stepFeedback[step.id] === "correct"

            if (isSolved && (index < unlockedIndex || finished)) {
              return (
                <div
                  key={step.id}
                  className={cn("rounded-lg border-2 p-4", borderFor("correct"))}
                >
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{step.hint}</p>
                  <div className="mt-3">
                    <StaticMath latex={step.solvedLatex} />
                  </div>
                  <p className="mt-2 text-sm font-medium text-green-700 dark:text-green-400">
                    Rätt
                  </p>
                </div>
              )
            }

            const feedback = stepFeedback[step.id] ?? "neutral"
            const state: StepState =
              feedback === "incorrect" ? "incorrect" : "active"

            return (
              <div
                key={step.id}
                className={cn("rounded-lg border-2 p-4 transition-colors", borderFor(state))}
              >
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{step.hint}</p>
                <div className="mt-3">
                  <ActiveStepField
                    step={step}
                    onCorrect={() => markCorrect(index)}
                    onStatus={(status) =>
                      setStepFeedback((prev) => ({
                        ...prev,
                        [step.id]: status,
                      }))
                    }
                  />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {feedback === "incorrect"
                    ? "Fel — prova igen"
                    : "Fyll i luckan för att gå vidare"}
                </p>
              </div>
            )
          })}
        </div>

        {finished ? (
          <div className="space-y-3 rounded-lg border border-green-500/40 bg-green-50 p-4 dark:bg-green-950/30">
            <p className="font-medium text-green-800 dark:text-green-300">
              Ekvationen är löst — x = 13
            </p>
            <StaticMath latex="3(13 - 2) + 4 = 2\cdot 13 + 11 = 37" />
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              Börja om
            </Button>
          </div>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={reset}>
            Börja om
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
