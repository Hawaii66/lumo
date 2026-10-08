import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { convexQuery } from "@convex-dev/react-query"
import { api } from "../../convex/_generated/api"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Label } from "~/components/ui/label"
import { MathField } from "~/components/math-field"
import { ComputeEngineDemo } from "~/components/compute-engine-demo"
import { FillInBlankDemo } from "~/components/fill-in-blank-demo"
import { MultiStepEquationDemo } from "~/components/multi-step-equation-demo"
import { PdfViewerDemo } from "~/components/pdf-viewer-demo"
import { RoomsPanel } from "~/components/rooms/rooms-panel"
import { SignInCard } from "~/components/sign-in"
import { useUiStore, type HelpLevel } from "~/stores/ui-store"

export const Route = createFileRoute("/")({
  component: Home,
})

const HELP_LEVELS: { value: HelpLevel; label: string }[] = [
  { value: "minimal", label: "Hitta fel" },
  { value: "explain", label: "Förklara tanke" },
  { value: "solve", label: "Lös helt" },
]

function Home() {
  const { data } = useSuspenseQuery(convexQuery(api.health.status, {}))
  const helpLevel = useUiStore((s) => s.helpLevel)
  const setHelpLevel = useUiStore((s) => s.setHelpLevel)
  const mathDraft = useUiStore((s) => s.mathDraft)
  const setMathDraft = useUiStore((s) => s.setMathDraft)

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-8 p-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Lumo</h1>
        <p className="text-muted-foreground">
          Sokratisk studieplattform — Convex + TanStack Start är igång.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Backend</CardTitle>
          <CardDescription>
            Convex health: {data.ok ? "ok" : "down"} ({data.service})
          </CardDescription>
        </CardHeader>
      </Card>

      <SignInCard />

      <RoomsPanel />

      <PdfViewerDemo />

      <Card>
        <CardHeader>
          <CardTitle>Hjälpnivå</CardTitle>
          <CardDescription>Zustand-styrd UI-state</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {HELP_LEVELS.map((level) => (
            <Button
              key={level.value}
              variant={helpLevel === level.value ? "default" : "outline"}
              onClick={() => setHelpLevel(level.value)}
            >
              {level.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MathLive</CardTitle>
          <CardDescription>
            Skriv en formel — LaTeX sparas i Zustand
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="math-draft">Formel</Label>
            <MathField
              value={mathDraft || "x^2+1"}
              onChange={setMathDraft}
              className="min-h-12"
            />
          </div>
          <p className="font-mono text-sm text-muted-foreground break-all">
            {mathDraft || "x^2+1"}
          </p>
        </CardContent>
      </Card>

      <FillInBlankDemo />

      <MultiStepEquationDemo />

      <ComputeEngineDemo />
    </main>
  )
}
