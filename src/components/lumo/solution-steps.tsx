import {
  createElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react"
import type { MathfieldElement } from "mathlive"
import type { HintPart, SolutionPart, SolutionStep } from "~/lib/lumo-content"
import { repairPlaceholderLatex } from "~/lib/lumo-content"
import { StaticMath } from "~/components/lumo/static-math"
import { StaticLumoParts } from "~/components/lumo/static-parts"
import { latexEquals } from "~/lib/latex-equals"
import { cn } from "~/lib/utils"

function StepHint({ hint }: { hint: Array<HintPart> }) {
  if (hint.length === 0) return null
  return (
    <StaticLumoParts
      parts={hint}
      className="mt-1 gap-0 text-sm text-muted-foreground"
    />
  )
}

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

function ActiveStepField({
  step,
  onCorrect,
  onStatus,
}: {
  step: SolutionStep
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
      el.value = repairPlaceholderLatex(step.latex)
      for (const prompt of step.prompts) {
        el.setPromptState(prompt.id, undefined, false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [step])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleInput = () => {
      let correctCount = 0
      let answeredCount = 0
      let anyIncorrect = false

      for (const prompt of step.prompts) {
        const value = el.getPromptValue(prompt.id).trim()
        if (!value || value === "?" || value === "\\placeholder") {
          el.setPromptState(prompt.id, undefined, false)
          continue
        }

        answeredCount += 1
        const ok = latexEquals(value, prompt.answer)
        el.setPromptState(prompt.id, ok ? "correct" : "incorrect", ok)
        if (ok) correctCount += 1
        else anyIncorrect = true
      }

      if (
        answeredCount === step.prompts.length &&
        correctCount === step.prompts.length
      ) {
        onCorrectRef.current()
        return
      }

      if (anyIncorrect) onStatusRef.current("incorrect")
      else onStatusRef.current("neutral")
    }

    el.addEventListener("input", handleInput)
    return () => el.removeEventListener("input", handleInput)
  }, [step])

  return createElement("math-field", {
    ref,
    className: "block w-full min-h-14 text-xl",
  })
}

export type SolutionStepsProps = {
  problemLatex: string
  steps: Array<SolutionStep>
  className?: string
  onFinished?: () => void
}

export function SolutionSteps({
  problemLatex,
  steps,
  className,
  onFinished,
}: SolutionStepsProps) {
  const [unlockedIndex, setUnlockedIndex] = useState(0)
  const [stepFeedback, setStepFeedback] = useState<
    Record<string, "neutral" | "correct" | "incorrect">
  >({})
  const [finished, setFinished] = useState(false)
  const solvedRef = useRef<Set<string>>(new Set())
  const onFinishedRef = useRef(onFinished)
  onFinishedRef.current = onFinished

  // Reset when the exercise identity changes.
  useEffect(() => {
    solvedRef.current = new Set()
    setUnlockedIndex(0)
    setStepFeedback({})
    setFinished(false)
  }, [problemLatex, steps])

  const markCorrect = useCallback(
    (index: number) => {
      const step = steps[index]
      if (solvedRef.current.has(step.id)) return
      solvedRef.current.add(step.id)

      setStepFeedback((prev) => ({ ...prev, [step.id]: "correct" }))

      if (index >= steps.length - 1) {
        setFinished(true)
        onFinishedRef.current?.()
        return
      }

      window.setTimeout(() => {
        setUnlockedIndex((current) => Math.max(current, index + 1))
      }, 350)
    },
    [steps],
  )

  return (
    <div className={cn("space-y-4", className)}>
      <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Uppgift
        </p>
        <StaticMath latex={problemLatex} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Steg {Math.min(unlockedIndex + 1, steps.length)} av {steps.length}
          {finished ? " — klart!" : null}
        </p>
        <div className="flex gap-1">
          {steps.map((step, index) => {
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
        {steps.map((step, index) => {
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
            (finished && index === steps.length - 1) ||
            stepFeedback[step.id] === "correct"

          if (isSolved && (index < unlockedIndex || finished)) {
            return (
              <div
                key={step.id}
                className={cn("rounded-lg border-2 p-4", borderFor("correct"))}
              >
                <p className="text-sm font-medium">{step.title}</p>
                <StepHint hint={step.hint} />
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
              className={cn(
                "rounded-lg border-2 p-4 transition-colors",
                borderFor(state),
              )}
            >
              <p className="text-sm font-medium">{step.title}</p>
              <StepHint hint={step.hint} />
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
        <p className="text-sm font-medium text-green-700 dark:text-green-400">
          Alla steg klara!
        </p>
      ) : null}
    </div>
  )
}

export function SolutionStepsFromPart({
  part,
  ...rest
}: { part: SolutionPart } & Omit<
  SolutionStepsProps,
  "problemLatex" | "steps"
>) {
  return (
    <SolutionSteps
      problemLatex={part.problemLatex}
      steps={part.steps}
      {...rest}
    />
  )
}
