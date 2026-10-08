import { useMemo, useState } from "react"
import { MathField } from "~/components/math-field"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  runComputeDemo,
  type ComputeResult,
} from "~/lib/compute-engine"

const EXAMPLES = [
  { label: "x+x+1", latex: "x+x+1" },
  { label: "(a+b)^2", latex: "(a+b)^2" },
  { label: "e^{iπ}", latex: "e^{i\\pi}" },
  { label: "sin²+cos²", latex: "\\sin^2(x)+\\cos^2(x)" },
  { label: "1/3", latex: "\\frac{1}{3}" },
  { label: "2^{11}-1", latex: "2^{11}-1" },
] as const

function ResultRow({
  title,
  result,
}: {
  title: string
  result: ComputeResult | null
}) {
  if (!result) {
    return (
      <div className="space-y-1 rounded-lg border border-dashed border-border p-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        <p className="text-sm text-muted-foreground">—</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <MathField value={result.latex} readOnly className="min-h-10 bg-muted/40" />
      <p className="font-mono text-xs break-all text-muted-foreground">
        {JSON.stringify(result.json)}
      </p>
    </div>
  )
}

export function ComputeEngineDemo() {
  const [latex, setLatex] = useState("x+x+1")
  const [xValue, setXValue] = useState("")

  const assignedX = useMemo(() => {
    if (xValue.trim() === "") return null
    const parsed = Number(xValue)
    return Number.isFinite(parsed) ? parsed : null
  }, [xValue])

  const results = useMemo(
    () => runComputeDemo(latex, { x: assignedX }),
    [latex, assignedX],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compute Engine</CardTitle>
        <CardDescription>
          Symbolisk förenkling, evaluering och numerisk beräkning via
          @cortex-js/compute-engine
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Uttryck</Label>
          <MathField value={latex} onChange={setLatex} className="min-h-12" />
          <p className="font-mono text-xs break-all text-muted-foreground">
            {latex || "—"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button
              key={example.latex}
              type="button"
              size="sm"
              variant={latex === example.latex ? "default" : "outline"}
              onClick={() => setLatex(example.latex)}
            >
              {example.label}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <Label htmlFor="assign-x">Tilldela x (valfritt)</Label>
          <Input
            id="assign-x"
            type="number"
            inputMode="decimal"
            placeholder="t.ex. 3"
            value={xValue}
            onChange={(event) => setXValue(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            När x är satt körs evaluate/N med den tilldelningen.
          </p>
        </div>

        {results.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {results.error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <ResultRow title="simplify()" result={results.simplify} />
          <ResultRow title="evaluate()" result={results.evaluate} />
          <ResultRow title="N()" result={results.numeric} />
          <ResultRow title="expand()" result={results.expand} />
        </div>
      </CardContent>
    </Card>
  )
}
