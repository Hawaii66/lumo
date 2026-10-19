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
    hint: [
      { type: "text", content: "Räkna ut" },
      { type: "latex", content: "3(x-2)", display: "inline" },
      { type: "text", content: ". Vad blir det?" },
    ],
    latex:
      "3(x - 2) + 4 = 2x + 11 \\Rightarrow \\placeholder[expand]{} + 4 = 2x + 11",
    prompts: [{ id: "expand", answer: "3x-6" }],
    solvedLatex: "3x - 6 + 4 = 2x + 11",
  },
  {
    id: "combine",
    title: "Steg 2 — Förenkla vänsterledet",
    hint: [
      { type: "text", content: "Räkna ihop" },
      { type: "latex", content: "-6+4", display: "inline" },
      { type: "text", content: ". Vad står kvar med" },
      { type: "latex", content: "3x", display: "inline" },
      { type: "text", content: "?" },
    ],
    latex:
      "3x - 6 + 4 = 2x + 11 \\Rightarrow 3x \\placeholder[combine]{} = 2x + 11",
    prompts: [{ id: "combine", answer: "-2" }],
    solvedLatex: "3x - 2 = 2x + 11",
  },
  {
    id: "isolate",
    title: "Steg 3 — Flytta över x-termer",
    hint: [
      { type: "text", content: "Dra bort" },
      { type: "latex", content: "2x", display: "inline" },
      { type: "text", content: "från båda led. Vad blir det nya vänsterledet?" },
    ],
    latex: "3x - 2 = 2x + 11 \\Rightarrow \\placeholder[left]{} = 11",
    prompts: [{ id: "left", answer: "x-2" }],
    solvedLatex: "x - 2 = 11",
  },
  {
    id: "constant",
    title: "Steg 4 — Isolera x",
    hint: [
      { type: "text", content: "Flytta över" },
      { type: "latex", content: "-2", display: "inline" },
      { type: "text", content: ". Vad blir" },
      { type: "latex", content: "x", display: "inline" },
      { type: "text", content: "?" },
    ],
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
