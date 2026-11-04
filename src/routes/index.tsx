import { createFileRoute, Link } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { convexQuery } from "@convex-dev/react-query"
import { useMutation } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import { DEBUG_TOP_UP_AMOUNTS } from "../../convex/lib/credits"
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

function formatResetAt(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "short",
    timeStyle: "short",
  })
}

function CreditsAndUsageDebugCard() {
  const { data: usage } = useSuspenseQuery(convexQuery(api.usage.myUsage, {}))
  const { data: config } = useSuspenseQuery(
    convexQuery(api.credits.getConfig, {}),
  )
  const { data: balance } = useSuspenseQuery(
    convexQuery(api.credits.getMyBalance, {}),
  )
  const createConfig = useMutation(api.credits.createConfig)
  const grantToday = useMutation(api.credits.debugGrantTodayFree)
  const topUp = useMutation(api.credits.debugTopUp)
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

  if (usage === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credits & användning (temp)</CardTitle>
          <CardDescription>
            Logga in för att se credits och AI-kostnad (chatt + tvillingar).
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (config === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credits & användning (temp)</CardTitle>
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
              void runDebug("create-config", () => createConfig({}))
            }
          >
            {busy === "create-config" ? "…" : "Skapa creditConfig"}
          </Button>
          {actionError !== null ? (
            <p className="text-destructive text-xs">{actionError}</p>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  if (balance === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credits & användning (temp)</CardTitle>
          <CardDescription>
            Logga in för att se credits och AI-kostnad (chatt + tvillingar).
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credits & användning (temp)</CardTitle>
        <CardDescription>
          Daglig free resetar (Stockholm). Betalda credits sparas. PDF-parse
          räknas inte i tokens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="space-y-1">
          <p className="font-medium">Credits</p>
          <p className="text-muted-foreground">
            Totalt {balance.totalAvailable} · daglig {balance.dailyRemaining} ·
            köpta {balance.paidBalance}
          </p>
          <p className="text-muted-foreground">
            Kostnad: chat {balance.costs.chatCreditCost} · tvilling{" "}
            {balance.costs.twinCreditCost} · free/dag{" "}
            {balance.costs.freeDailyCredits}
          </p>
          <p className="text-muted-foreground">
            Nästa free-reset: {formatResetAt(balance.nextResetAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              void runDebug("grant", () => grantToday({}))
            }
          >
            {busy === "grant" ? "…" : "Ge dagens free credits"}
          </Button>
          {DEBUG_TOP_UP_AMOUNTS.map((amount) => (
            <Button
              key={amount}
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() =>
                void runDebug(`top-${amount}`, () => topUp({ amount }))
              }
            >
              {busy === `top-${amount}` ? "…" : `Top up ${amount}`}
            </Button>
          ))}
        </div>
        {actionError !== null ? (
          <p className="text-destructive text-xs">{actionError}</p>
        ) : null}

        <div className="space-y-3 border-t pt-4">
          <p className="font-medium">Token-spend (OpenRouter)</p>
          <p className="text-muted-foreground">
            Totalt {formatUsd(usage.costUsd)} ·{" "}
            {formatTokens(usage.totalTokens)} tokens ({usage.eventCount}{" "}
            debiteringar)
          </p>
          <div className="space-y-1">
            <p className="font-medium">Chat</p>
            <p className="text-muted-foreground">
              {formatUsd(usage.bySource.chat.costUsd)} ·{" "}
              {formatTokens(usage.bySource.chat.totalTokens)} tokens ·{" "}
              {usage.bySource.chat.eventCount} meddelanden
            </p>
            <p className="text-muted-foreground pl-3">
              normal: {formatUsd(usage.bySource.chat.byMode.normal.costUsd)} ·
              genomgång:{" "}
              {formatUsd(usage.bySource.chat.byMode.genomgang.costUsd)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="font-medium">Tvillinggenerering</p>
            <p className="text-muted-foreground">
              {formatUsd(usage.bySource.twin_generation.costUsd)} ·{" "}
              {formatTokens(usage.bySource.twin_generation.totalTokens)} tokens
              · {usage.bySource.twin_generation.eventCount} tvillingar
            </p>
          </div>
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

      <CreditsAndUsageDebugCard />

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
