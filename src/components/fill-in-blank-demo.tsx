import { useState } from "react"
import type { PromptSpec } from "~/lib/lumo-content"
import { FillInBlank } from "~/components/lumo/fill-in-blank"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

type Exercise = {
  id: string
  title: string
  prompt: string
  latex: string
  prompts: Array<PromptSpec>
}

const EXERCISES: Array<Exercise> = [
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

export function FillInBlankDemo() {
  const [exerciseId, setExerciseId] = useState(EXERCISES[0].id)
  const exercise = EXERCISES.find((item) => item.id === exerciseId) ?? EXERCISES[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Luckformel (fill-in-the-blank)</CardTitle>
        <CardDescription>
          Readonly MathLive med{" "}
          <code className="font-mono text-xs">\placeholder[id]{"{}"}</code> —
          svar ligger i <code className="font-mono text-xs">prompts</code> och
          valideras med Compute Engine
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

        <FillInBlank
          key={exercise.id}
          latex={exercise.latex}
          prompts={exercise.prompts}
          prompt={exercise.prompt}
        />

        <p className="font-mono text-xs break-all text-muted-foreground">
          {exercise.latex}
        </p>
      </CardContent>
    </Card>
  )
}
