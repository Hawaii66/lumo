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
import {
  FALLBACK_CHAT_MODEL_LEVELS,
  resolveChatModelLevels,
  type ChatModelLevel,
  type ChatModelLevelConfig,
} from "~/lib/chat-model-level"

type LevelDraft = {
  name: string
  modelId: string
  creditCost: string
}

type ConfigDraft = {
  twinCreditCost: string
  levels: Record<ChatModelLevel, LevelDraft>
}

function levelsToDraft(
  levels: Array<ChatModelLevelConfig>,
): Record<ChatModelLevel, LevelDraft> {
  const resolved = resolveChatModelLevels(levels)
  return {
    1: {
      name: resolved[0]!.name,
      modelId: resolved[0]!.modelId,
      creditCost: String(resolved[0]!.creditCost),
    },
    2: {
      name: resolved[1]!.name,
      modelId: resolved[1]!.modelId,
      creditCost: String(resolved[1]!.creditCost),
    },
    3: {
      name: resolved[2]!.name,
      modelId: resolved[2]!.modelId,
      creditCost: String(resolved[2]!.creditCost),
    },
  }
}

export function CreditConfigAdminCard() {
  const config = useQuery(api.credits.getConfig)
  const createConfig = useMutation(api.credits.createConfig)
  const updateConfig = useMutation(api.credits.updateConfig)

  const [draft, setDraft] = useState<ConfigDraft>({
    twinCreditCost: "5",
    levels: levelsToDraft(FALLBACK_CHAT_MODEL_LEVELS),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (config === null || config === undefined) return
    setDraft({
      twinCreditCost: String(config.twinCreditCost),
      levels: levelsToDraft(config.chatModelLevels),
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

  const currentLevels =
    config === null
      ? FALLBACK_CHAT_MODEL_LEVELS
      : resolveChatModelLevels(config.chatModelLevels)

  const dirty =
    config !== null &&
    (draft.twinCreditCost.trim() !== String(config.twinCreditCost) ||
      ([1, 2, 3] as const).some((level) => {
        const row = currentLevels.find((entry) => entry.level === level)!
        const d = draft.levels[level]
        return (
          d.name.trim() !== row.name ||
          d.modelId.trim() !== row.modelId ||
          d.creditCost.trim() !== String(row.creditCost)
        )
      }))

  function parseField(label: string, raw: string, min: number): number {
    const parsed = Number.parseInt(raw.trim(), 10)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min) {
      throw new Error(`${label} måste vara ett heltal ≥ ${min}`)
    }
    return parsed
  }

  function patchLevel(
    level: ChatModelLevel,
    patch: Partial<LevelDraft>,
  ) {
    setDraft((prev) => ({
      ...prev,
      levels: {
        ...prev.levels,
        [level]: { ...prev.levels[level], ...patch },
      },
    }))
    setFlash(false)
    setError(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit-config</CardTitle>
        <CardDescription>
          Tre chattmodeller (namn, OpenRouter-id, kostnad per meddelande) plus
          tvillingkostnad. Gratis-gränser per roll ställs under Roller.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config === null ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              creditConfig saknas. Skapa den med standardnivåer (Snabb 1 · Smart
              2 · Pro 4 · tvilling 5).
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
                const twinCreditCost = parseField(
                  "Tvilling-kostnad",
                  draft.twinCreditCost,
                  1,
                )
                const chatModelLevels = ([1, 2, 3] as const).map((level) => {
                  const row = draft.levels[level]
                  if (row.name.trim().length === 0) {
                    throw new Error(`Namn saknas för nivå ${level}`)
                  }
                  if (row.modelId.trim().length === 0) {
                    throw new Error(`modelId saknas för nivå ${level}`)
                  }
                  return {
                    level,
                    name: row.name.trim(),
                    modelId: row.modelId.trim(),
                    creditCost: parseField(
                      `Kostnad nivå ${level}`,
                      row.creditCost,
                      1,
                    ),
                  }
                })
                setSaving(true)
                void updateConfig({
                  twinCreditCost,
                  chatModelLevels,
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
            <div className="space-y-4">
              {([1, 2, 3] as const).map((level) => (
                <div
                  key={level}
                  className="space-y-2 rounded-lg border border-border/80 p-3"
                >
                  <p className="text-sm font-medium">Nivå {level}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label htmlFor={`cfg-name-${level}`}>Namn</Label>
                      <Input
                        id={`cfg-name-${level}`}
                        value={draft.levels[level].name}
                        onChange={(e) => {
                          patchLevel(level, { name: e.target.value })
                        }}
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor={`cfg-model-${level}`}>
                        OpenRouter modelId
                      </Label>
                      <Input
                        id={`cfg-model-${level}`}
                        value={draft.levels[level].modelId}
                        onChange={(e) => {
                          patchLevel(level, { modelId: e.target.value })
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`cfg-cost-${level}`}>
                        Credits / meddelande
                      </Label>
                      <Input
                        id={`cfg-cost-${level}`}
                        inputMode="numeric"
                        value={draft.levels[level].creditCost}
                        onChange={(e) => {
                          patchLevel(level, { creditCost: e.target.value })
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5 sm:max-w-xs">
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
