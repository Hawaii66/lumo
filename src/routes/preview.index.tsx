import { createFileRoute, Link } from "@tanstack/react-router"
import { useMemo, useState } from "react"
import { ParsedProblemView } from "~/components/lumo/parsed-problem"
import { Button } from "~/components/ui/button"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"
import { parseLumoParsedProblems } from "~/lib/lumo-content"

export const Route = createFileRoute("/preview/")({
  component: PreviewProblemsPage,
})

const SAMPLE = `[
  {
    "problemNumber": "1.3",
    "question": {
      "version": 1,
      "parts": [
        {
          "content": "Ange den minsta gemensamma nämnaren. Beräkna sedan summan.",
          "type": "text"
        },
        { "label": "a", "type": "subproblem" },
        {
          "content": "\\\\frac{1}{20}, \\\\frac{1}{28}, \\\\frac{1}{21}",
          "display": "inline",
          "type": "latex"
        },
        { "label": "b", "type": "subproblem" },
        {
          "content": "\\\\frac{x+1}{x^{2}+1}, \\\\frac{2x+4}{x^{2}-1}, \\\\frac{-3}{x-1}",
          "display": "inline",
          "type": "latex"
        }
      ]
    },
    "answer": {
      "version": 1,
      "parts": [
        { "label": "a", "type": "subproblem" },
        {
          "caption": "Mgn",
          "content": "420",
          "display": "inline",
          "type": "latex"
        },
        {
          "caption": "summa",
          "content": "\\\\frac{2}{15}",
          "display": "inline",
          "type": "latex"
        },
        { "label": "b", "type": "subproblem" },
        {
          "caption": "Mgn",
          "content": "(x^{2}+1)(x+1)(x-1)",
          "display": "inline",
          "type": "latex"
        },
        {
          "caption": "summa",
          "content": "\\\\frac{2x}{(x+1)(x^{2}+1)}",
          "display": "inline",
          "type": "latex"
        }
      ]
    }
  },
  {
    "problemNumber": "1.19",
    "question": {
      "version": 1,
      "parts": [
        { "content": "Bestäm alla reella x som uppfyller", "type": "text" },
        { "label": "b", "type": "subproblem" },
        {
          "content": "x + \\\\sqrt{1-4x} = 1",
          "display": "inline",
          "type": "latex"
        }
      ]
    },
    "answer": {
      "version": 1,
      "parts": [
        { "label": "b", "type": "subproblem" },
        { "content": "x=0", "display": "inline", "type": "latex" },
        { "content": "x=-2", "display": "inline", "type": "latex" }
      ]
    }
  }
]`

function PreviewProblemsPage() {
  const [raw, setRaw] = useState("")
  const [showAnswer, setShowAnswer] = useState(true)

  const { problems, error } = useMemo(
    () => parseLumoParsedProblems(raw),
    [raw],
  )

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6 md:p-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Lumo problem preview
          </h1>
          <p className="text-sm text-muted-foreground">
            Klistra in JSON från PDF-parsen (text / latex / subproblem; valfri
            caption).
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link
            to="/preview/sidebar"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Sidebar preview
          </Link>
          <Link
            to="/"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Hem
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="lumo-paste">JSON</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRaw(SAMPLE)}
            >
              Ladda exempel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRaw("")}
            >
              Rensa
            </Button>
          </div>
        </div>
        <Textarea
          id="lumo-paste"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='[{ "problemNumber": "1.1", "question": { ... }, "answer": { ... } }]'
          className="min-h-48 font-mono text-xs"
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={showAnswer}
              onChange={(e) => setShowAnswer(e.target.checked)}
              className="size-4 rounded border-input"
            />
            Visa svar
          </label>
          {raw.trim() && !error ? (
            <span className="text-muted-foreground">
              {problems.length} problem
            </span>
          ) : null}
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {problems.length > 0 ? (
        <div className="flex flex-col gap-8 divide-y divide-border/60">
          {problems.map((problem) => (
            <ParsedProblemView
              key={problem.problemNumber}
              problem={problem}
              showAnswer={showAnswer}
              className="pt-6 first:pt-0"
            />
          ))}
        </div>
      ) : !error && !raw.trim() ? (
        <p className="text-sm text-muted-foreground">
          Inget att visa ännu — klistra in JSON eller ladda exemplet.
        </p>
      ) : null}
    </main>
  )
}
