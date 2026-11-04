import { useMutation, useQuery } from "convex/react"
import { useEffect, useState } from "react"
import { api } from "../../../convex/_generated/api"
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

type ConfigDraft = {
  chatCreditCost: string
  twinCreditCost: string
}

export function CreditConfigAdminCard() {
  const config = useQuery(api.credits.getConfig)
  const createConfig = useMutation(api.credits.createConfig)
  const updateConfig = useMutation(api.credits.updateConfig)

  const [draft, setDraft] = useState<ConfigDraft>({
    chatCreditCost: "1",
    twinCreditCost: "5",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (config === null || config === undefined) return
    setDraft({
      chatCreditCost: String(config.chatCreditCost),
      twinCreditCost: String(config.twinCreditCost),
    })
  }, [config])

  if (config === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit-config</CardTitle>
          <CardDescription>Hämtar config…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const dirty =
    config !== null &&
    (draft.chatCreditCost.trim() !== String(config.chatCreditCost) ||
      draft.twinCreditCost.trim() !== String(config.twinCreditCost))

  function parseField(label: string, raw: string, min: number): number {
    const parsed = Number.parseInt(raw.trim(), 10)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
      throw new Error(`${label} måste vara ett heltal ≥ ${min}`)
    }
    return parsed
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit-config</CardTitle>
        <CardDescription>
          Kostnad per chattmeddelande och tvillingproblem. Gratis-gränser per
          roll ställs under Roller.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config === null ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              creditConfig saknas. Skapa den med standardvärden (chat 1 ·
              tvilling 5).
            </p>
            <Button
              type="button"
              disabled={saving}
              onClick={() => {
                setSaving(true)
                setError(null)
                setFlash(false)
                void createConfig({})
                  .then(() => setFlash(true))
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error ? err.message : "Kunde inte skapa",
                    )
                  })
                  .finally(() => setSaving(false))
              }}
            >
              {saving ? "Skapar…" : "Skapa creditConfig"}
            </Button>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              setError(null)
              setFlash(false)
              try {
                const chatCreditCost = parseField(
                  "Chat-kostnad",
                  draft.chatCreditCost,
                  1,
                )
                const twinCreditCost = parseField(
                  "Tvilling-kostnad",
                  draft.twinCreditCost,
                  1,
                )
                setSaving(true)
                void updateConfig({
                  chatCreditCost,
                  twinCreditCost,
                })
                  .then(() => setFlash(true))
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error ? err.message : "Kunde inte spara",
                    )
                  })
                  .finally(() => setSaving(false))
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : "Ogiltigt värde")
              }
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cfg-chat">Chat-kostnad</Label>
                <Input
                  id="cfg-chat"
                  inputMode="numeric"
                  value={draft.chatCreditCost}
                  onChange={(e) => {
                    setDraft((prev) => ({
                      ...prev,
                      chatCreditCost: e.target.value,
                    }))
                    setFlash(false)
                    setError(null)
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cfg-twin">Tvilling-kostnad</Label>
                <Input
                  id="cfg-twin"
                  inputMode="numeric"
                  value={draft.twinCreditCost}
                  onChange={(e) => {
                    setDraft((prev) => ({
                      ...prev,
                      twinCreditCost: e.target.value,
                    }))
                    setFlash(false)
                    setError(null)
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving || !dirty}>
                {saving ? "Sparar…" : "Spara"}
              </Button>
              {flash ? (
                <p className="text-muted-foreground text-xs">Sparat.</p>
              ) : null}
            </div>
          </form>
        )}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
