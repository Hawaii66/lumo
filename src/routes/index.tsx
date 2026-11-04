import { createFileRoute, Link } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { convexQuery } from "@convex-dev/react-query"
import { api } from "../../convex/_generated/api"
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
import { PdfViewerDemo } from "~/components/pdf-viewer-demo"
import { RoomsPanel } from "~/components/rooms/rooms-panel"
import { SignInCard } from "~/components/sign-in"
import { useUiStore } from "~/stores/ui-store"

export const Route = createFileRoute("/")({
  component: Home,
})

function formatTokens(n: number) {
  return n.toLocaleString("sv-SE")
}

function formatUsd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  })
}

function UsageDebugCard() {
  const { data } = useSuspenseQuery(convexQuery(api.usage.myUsage, {}))

  if (data === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI-användning (temp)</CardTitle>
          <CardDescription>
            Logga in för att se kostnad (chatt + tvillingar).
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI-användning (temp)</CardTitle>
        <CardDescription>
          OpenRouter-kostnad (USD) — PDF-parse räknas inte. Totalt{" "}
          {formatUsd(data.costUsd)} · {formatTokens(data.totalTokens)} tokens (
          {data.eventCount} debiteringar).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-1">
          <p className="font-medium">Chat</p>
          <p className="text-muted-foreground">
            {formatUsd(data.bySource.chat.costUsd)} ·{" "}
            {formatTokens(data.bySource.chat.totalTokens)} tokens ·{" "}
            {data.bySource.chat.eventCount} meddelanden
          </p>
          <p className="text-muted-foreground pl-3">
            normal: {formatUsd(data.bySource.chat.byMode.normal.costUsd)} ·
            genomgång: {formatUsd(data.bySource.chat.byMode.genomgang.costUsd)}
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-medium">Tvillinggenerering</p>
          <p className="text-muted-foreground">
            {formatUsd(data.bySource.twin_generation.costUsd)} ·{" "}
            {formatTokens(data.bySource.twin_generation.totalTokens)} tokens ·{" "}
            {data.bySource.twin_generation.eventCount} tvillingar (variant+lös
            sammanslaget)
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function Home() {
  const { data } = useSuspenseQuery(convexQuery(api.health.status, {}))
  const mathDraft = useUiStore((s) => s.mathDraft)
  const setMathDraft = useUiStore((s) => s.setMathDraft)

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-8 p-8">
      <div className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Lumo</h1>
        <p className="text-muted-foreground">
          Sokratisk studieplattform — Convex + TanStack Start är igång.
        </p>
        <p>
          <Link
            to="/preview"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Problem preview (klistra in PDF-JSON) →
          </Link>
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

      <UsageDebugCard />

      <RoomsPanel />

      <PdfViewerDemo />

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

      <ComputeEngineDemo />
    </main>
  )
}
