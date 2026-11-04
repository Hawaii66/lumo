import { createFileRoute, Link } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { convexQuery } from "@convex-dev/react-query"
import { useMutation } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Button } from "~/components/ui/button"
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

/** Slim home strip: link to profile + bootstrap when creditConfig is missing. */
function CreditsHomeCard() {
  const { data: config } = useSuspenseQuery(
    convexQuery(api.credits.getConfig, {}),
  )
  const createConfig = useMutation(api.credits.createConfig)
  const seedDeals = useMutation(api.creditDeals.seedDefaultDeals)
  const grantToday = useMutation(api.credits.debugGrantTodayFree)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function runDebug(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    setActionError(null)
    try {
      await fn()
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Något gick fel")
    } finally {
      setBusy(null)
    }
  }

  if (config === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credits</CardTitle>
          <CardDescription>
            creditConfig saknas. Skapa den innan chat/tvilling kan debiteras
            (standard: chat 1 · tvilling 5 · free/dag 30).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            type="button"
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              void runDebug("create-config", async () => {
                await createConfig({})
                await seedDeals({})
              })
            }
          >
            {busy === "create-config" ? "…" : "Skapa creditConfig + deals"}
          </Button>
          {actionError !== null ? (
            <p className="text-destructive text-xs">{actionError}</p>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits</CardTitle>
        <CardDescription>
          Saldo, köp och daglig förbrukning finns under Profil.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button size="sm" render={<Link to="/profile" />}>
          Öppna profil
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void runDebug("grant", () => grantToday({}))}
        >
          {busy === "grant" ? "…" : "Ge dagens free credits (debug)"}
        </Button>
        {actionError !== null ? (
          <p className="text-destructive w-full text-xs">{actionError}</p>
        ) : null}
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
        <p className="flex flex-wrap gap-x-4 gap-y-1">
          <Link
            to="/preview"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Problem preview (klistra in PDF-JSON) →
          </Link>
          <Link
            to="/profile"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Profil →
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

      <CreditsHomeCard />

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
