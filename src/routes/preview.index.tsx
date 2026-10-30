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

const SAMPLE = JSON.stringify(
  [
    {
      problemNumber: "1.3",
      question: [
        "Ange den minsta gemensamma nämnaren. Beräkna sedan summan.",
        "",
        "### (a)",
        "",
        "$\\frac{1}{20}$, $\\frac{1}{28}$, $\\frac{1}{21}$",
        "",
        "### (b)",
        "",
        "$\\frac{x+1}{x^{2}+1}$, $\\frac{2x+4}{x^{2}-1}$, $\\frac{-3}{x-1}$",
      ].join("\n"),
      answer: [
        "### (a)",
        "",
        "Mgn är $420$. Summan är $\\frac{2}{15}$.",
        "",
        "### (b)",
        "",
        "Mgn är $(x^{2}+1)(x+1)(x-1)$. Summan är $\\frac{2x}{(x+1)(x^{2}+1)}$.",
      ].join("\n"),
    },
    {
      problemNumber: "1.19",
      question: [
        "Bestäm alla reella $x$ som uppfyller",
        "",
        "### (b)",
        "",
        "$x + \\sqrt{1-4x} = 1$",
      ].join("\n"),
      answer: ["### (b)", "", "$x=0$", "", "$x=-2$"].join("\n"),
    },
  ],
  null,
  2,
)

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
            Klistra in JSON från PDF-parsen (
            <code className="text-xs">problemNumber</code>, markdown{" "}
            <code className="text-xs">question</code> /{" "}
            <code className="text-xs">answer</code> med $ / $$).
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link
            to="/preview/sidebar"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            Sidebar preview
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="raw">JSON</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRaw(SAMPLE)}
            >
              Ladda exempel
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRaw("")}
            >
              Rensa
            </Button>
          </div>
        </div>
        <Textarea
          id="raw"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          className="min-h-48 font-mono text-xs"
          placeholder='[{ "problemNumber": "1.1", "question": "…", "answer": "…" }]'
        />
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={showAnswer}
          onChange={(e) => setShowAnswer(e.target.checked)}
        />
        Visa facit
      </label>

      <div className="space-y-8">
        {problems.map((problem) => (
          <ParsedProblemView
            key={problem.problemNumber}
            problem={problem}
            showAnswer={showAnswer}
          />
        ))}
        {raw.trim() && problems.length === 0 && !error ? (
          <p className="text-sm text-muted-foreground">Inga problem.</p>
        ) : null}
      </div>
    </main>
  )
}
