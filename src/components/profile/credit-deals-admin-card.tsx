import { useMutation, useQuery } from "convex/react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
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
import { Switch } from "~/components/ui/switch"
import { Textarea } from "~/components/ui/textarea"

type DealDraft = {
  name: string
  description: string
  priceSek: string
  creditsGranted: string
  sortOrder: string
  active: boolean
}

const EMPTY_DRAFT: DealDraft = {
  name: "",
  description: "",
  priceSek: "50",
  creditsGranted: "100",
  sortOrder: "10",
  active: true,
}

function draftFromDeal(deal: {
  name: string
  description: string
  priceSek: number
  creditsGranted: number
  sortOrder: number
  active: boolean
}): DealDraft {
  return {
    name: deal.name,
    description: deal.description,
    priceSek: String(deal.priceSek),
    creditsGranted: String(deal.creditsGranted),
    sortOrder: String(deal.sortOrder),
    active: deal.active,
  }
}

function parsePositive(label: string, raw: string): number {
  const parsed = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} måste vara ett heltal ≥ 1`)
  }
  return parsed
}

export function CreditDealsAdminCard() {
  const deals = useQuery(api.creditDeals.listAllDeals)
  const upsertDeal = useMutation(api.creditDeals.upsertDeal)
  const setDealActive = useMutation(api.creditDeals.setDealActive)
  const seedDefaultDeals = useMutation(api.creditDeals.seedDefaultDeals)

  const [editingId, setEditingId] = useState<Id<"creditDeals"> | "new" | null>(
    null,
  )
  const [draft, setDraft] = useState<DealDraft>(EMPTY_DRAFT)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  if (deals === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit-deals</CardTitle>
          <CardDescription>Hämtar paket…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  function startCreate() {
    setEditingId("new")
    setDraft(EMPTY_DRAFT)
    setError(null)
    setFlash(null)
  }

  function startEdit(
    deal: NonNullable<typeof deals>[number],
  ) {
    setEditingId(deal._id)
    setDraft(draftFromDeal(deal))
    setError(null)
    setFlash(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft(EMPTY_DRAFT)
    setError(null)
  }

  async function saveDraft() {
    setBusy(true)
    setError(null)
    setFlash(null)
    try {
      if (draft.name.trim().length === 0) {
        throw new Error("Namn får inte vara tomt")
      }
      if (draft.description.trim().length === 0) {
        throw new Error("Beskrivning får inte vara tom")
      }
      const priceSek = parsePositive("Pris", draft.priceSek)
      const creditsGranted = parsePositive("Credits", draft.creditsGranted)
      const sortOrder = parsePositive("Sortering", draft.sortOrder)
      await upsertDeal({
        dealId: editingId === "new" || editingId === null ? undefined : editingId,
        name: draft.name,
        description: draft.description,
        priceSek,
        creditsGranted,
        sortOrder,
        active: draft.active,
      })
      setFlash(editingId === "new" ? "Paket skapat." : "Paket sparat.")
      setEditingId(null)
      setDraft(EMPTY_DRAFT)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte spara")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Credit-deals</CardTitle>
        <CardDescription>
          Köpbara paket i Stripe Checkout. Inaktiva visas inte för användare.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {deals.length === 0 ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Inga paket ännu. Seed:a standardpaketen eller skapa ett nytt.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setError(null)
                  setFlash(null)
                  void seedDefaultDeals({})
                    .then((res) => {
                      setFlash(
                        res.inserted > 0
                          ? `Seedade ${res.inserted} paket.`
                          : "Paket fanns redan.",
                      )
                    })
                    .catch((err: unknown) => {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Kunde inte seeda",
                      )
                    })
                    .finally(() => setBusy(false))
                }}
              >
                Seed standardpaket
              </Button>
              <Button type="button" disabled={busy} onClick={startCreate}>
                Nytt paket
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {deals.map((deal) => (
                <li
                  key={deal._id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="font-medium">
                      {deal.name}
                      {!deal.active ? (
                        <span className="text-muted-foreground ml-2 text-xs font-normal">
                          (inaktiv)
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      +{deal.creditsGranted} credits · {deal.priceSek} kr ·
                      sort {deal.sortOrder}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={deal.active}
                      disabled={busy}
                      onCheckedChange={(checked) => {
                        setBusy(true)
                        setError(null)
                        void setDealActive({
                          dealId: deal._id,
                          active: checked,
                        })
                          .catch((err: unknown) => {
                            setError(
                              err instanceof Error
                                ? err.message
                                : "Kunde inte uppdatera",
                            )
                          })
                          .finally(() => setBusy(false))
                      }}
                      aria-label={
                        deal.active ? "Inaktivera paket" : "Aktivera paket"
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => startEdit(deal)}
                    >
                      Redigera
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            {editingId === null ? (
              <Button type="button" disabled={busy} onClick={startCreate}>
                Nytt paket
              </Button>
            ) : null}
          </>
        )}

        {editingId !== null ? (
          <form
            className="space-y-3 rounded-md border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              void saveDraft()
            }}
          >
            <p className="text-sm font-medium">
              {editingId === "new" ? "Nytt paket" : "Redigera paket"}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="deal-name">Namn</Label>
              <Input
                id="deal-name"
                value={draft.name}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deal-desc">Beskrivning</Label>
              <Textarea
                id="deal-desc"
                value={draft.description}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="deal-price">Pris (kr)</Label>
                <Input
                  id="deal-price"
                  inputMode="numeric"
                  value={draft.priceSek}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      priceSek: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deal-credits">Credits</Label>
                <Input
                  id="deal-credits"
                  inputMode="numeric"
                  value={draft.creditsGranted}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      creditsGranted: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deal-sort">Sortering</Label>
                <Input
                  id="deal-sort"
                  inputMode="numeric"
                  value={draft.sortOrder}
                  onChange={(e) =>
                    setDraft((prev) => ({
                      ...prev,
                      sortOrder: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={draft.active}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({ ...prev, active: checked }))
                }
                id="deal-active"
              />
              <Label htmlFor="deal-active">Aktivt</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Sparar…" : "Spara"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={cancelEdit}
              >
                Avbryt
              </Button>
            </div>
          </form>
        ) : null}

        {flash ? (
          <p className="text-muted-foreground text-xs">{flash}</p>
        ) : null}
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
      </CardContent>
    </Card>
  )
}
