import { useState } from "react"
import type { SolutionStep } from "~/lib/lumo-content"
import { SolutionSteps } from "~/components/lumo/solution-steps"
import { StaticMath } from "~/components/lumo/static-math"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

const PROBLEM_LATEX = "3(x - 2) + 4 = 2x + 11"

const STEPS: Array<SolutionStep> = [
  {
    id: "expand",
    title: "Steg 1 — Expandera parentesen",
    hint: "Räkna ut 3(x − 2). Vad blir det?",
    latex:
      "3(x - 2) + 4 = 2x + 11 \\Rightarrow \\placeholder[expand]{} + 4 = 2x + 11",
    prompts: [{ id: "expand", answer: "3x-6" }],
    solvedLatex: "3x - 6 + 4 = 2x + 11",
  },
  {
    id: "combine",
    title: "Steg 2 — Förenkla vänsterledet",
    hint: "Räkna ihop −6 + 4. Vad står kvar med 3x?",
    latex:
      "3x - 6 + 4 = 2x + 11 \\Rightarrow 3x \\placeholder[combine]{} = 2x + 11",
    prompts: [{ id: "combine", answer: "-2" }],
    solvedLatex: "3x - 2 = 2x + 11",
  },
  {
    id: "isolate",
    title: "Steg 3 — Flytta över x-termer",
    hint: "Dra bort 2x från båda led. Vad blir det nya vänsterledet?",
    latex: "3x - 2 = 2x + 11 \\Rightarrow \\placeholder[left]{} = 11",
    prompts: [{ id: "left", answer: "x-2" }],
    solvedLatex: "x - 2 = 11",
  },
  {
    id: "constant",
    title: "Steg 4 — Isolera x",
    hint: "Flytta över −2. Vad blir x?",
    latex: "x - 2 = 11 \\Rightarrow x = \\placeholder[solution]{}",
    prompts: [{ id: "solution", answer: "13" }],
    solvedLatex: "x = 13",
  },
]

export function MultiStepEquationDemo() {
  const [resetKey, setResetKey] = useState(0)
  const [finished, setFinished] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flerstegs ekvation</CardTitle>
        <CardDescription>
          Lös ekvationen steg för steg. Rätt svar låser upp nästa steg.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SolutionSteps
          key={resetKey}
          problemLatex={PROBLEM_LATEX}
          steps={STEPS}
          onFinished={() => setFinished(true)}
        />

        {finished ? (
          <div className="space-y-3 rounded-lg border border-green-500/40 bg-green-50 p-4 dark:bg-green-950/30">
            <p className="font-medium text-green-800 dark:text-green-300">
              Ekvationen är löst — x = 13
            </p>
            <StaticMath latex="3(13 - 2) + 4 = 2\cdot 13 + 11 = 37" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setFinished(false)
                setResetKey((k) => k + 1)
              }}
            >
              Börja om
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFinished(false)
              setResetKey((k) => k + 1)
            }}
          >
            Börja om
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
