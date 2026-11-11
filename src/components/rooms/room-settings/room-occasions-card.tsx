import { useMutation, useQuery } from "convex/react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
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
import { formatOccasionLabel } from "~/lib/occasion-label"
import { cn } from "~/lib/utils"

export function RoomOccasionsCard({ roomId }: { roomId: Id<"rooms"> }) {
  const occasions = useQuery(api.roomOccasions.listByRoom, { roomId })
  const createOccasion = useMutation(api.roomOccasions.create)
  const updateOccasion = useMutation(api.roomOccasions.update)
  const removeOccasion = useMutation(api.roomOccasions.remove)

  const [name, setName] = useState("")
  const [date, setDate] = useState("")
  const [editingId, setEditingId] = useState<Id<"roomOccasions"> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSaveOccasion() {
    setError(null)
    setSaved(false)
    setPending(true)
    try {
      if (editingId !== null) {
        await updateOccasion({
          occasionId: editingId,
          name,
          date,
        })
      } else {
        await createOccasion({ roomId, name, date })
      }
      setName("")
      setDate("")
      setEditingId(null)
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kunde inte spara tillfället",
      )
    } finally {
      setPending(false)
    }
  }

  async function handleDeleteOccasion(occasionId: Id<"roomOccasions">) {
    setError(null)
    setSaved(false)
    setPending(true)
    try {
      await removeOccasion({ occasionId })
      if (editingId === occasionId) {
        setEditingId(null)
        setName("")
        setDate("")
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kunde inte ta bort tillfället",
      )
    } finally {
      setPending(false)
    }
  }

  function startEdit(occasion: {
    _id: Id<"roomOccasions">
    name: string
    date: string
  }) {
    setEditingId(occasion._id)
    setName(occasion.name)
    setDate(occasion.date)
    setSaved(false)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setName("")
    setDate("")
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tillfällen</CardTitle>
        <CardDescription>
          Skapa lektioner/dagar med namn och datum. Tilldela uppgifter till dem
          i uppgiftsvyn (bredvid stjärnor och klar-markering). Vyn
          &quot;Tillfällen&quot; under Uppgifter grupperar efter detta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved ? (
          <p className="text-sm text-muted-foreground">Sparat.</p>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-sm font-medium">
            {editingId !== null ? "Redigera tillfälle" : "Nytt tillfälle"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="occasion-name">Namn</Label>
              <Input
                id="occasion-name"
                value={name}
                placeholder="Lektion 3"
                maxLength={80}
                disabled={pending}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="occasion-date">Datum</Label>
              <Input
                id="occasion-date"
                type="date"
                value={date}
                disabled={pending}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>
          {name.trim().length > 0 && date.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Förhandsvisning: {formatOccasionLabel(name.trim(), date)}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending || name.trim().length === 0 || date.length === 0}
              onClick={() => {
                void handleSaveOccasion()
              }}
            >
              {pending ? (
                <Loader2 className="animate-spin" />
              ) : editingId !== null ? null : (
                <Plus />
              )}
              {editingId !== null ? "Spara ändringar" : "Lägg till"}
            </Button>
            {editingId !== null ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={cancelEdit}
              >
                Avbryt
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Tillfällen i rummet</h3>
          {occasions === undefined ? (
            <p className="text-sm text-muted-foreground">Hämtar…</p>
          ) : occasions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga tillfällen ännu. Lägg till ovan.
            </p>
          ) : (
            <ul className="space-y-1 rounded-md border border-border p-2">
              {occasions.map((occasion) => (
                <li key={occasion._id}>
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      editingId === occasion._id && "bg-muted",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {occasion.label}
                      <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                        ({occasion.assignments.length})
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground"
                      aria-label={`Redigera ${occasion.label}`}
                      disabled={pending}
                      onClick={() => startEdit(occasion)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground"
                      aria-label={`Ta bort ${occasion.label}`}
                      disabled={pending}
                      onClick={() => {
                        const ok = window.confirm(
                          `Ta bort ${occasion.label}? Tilldelade uppgifter blir otilldelade.`,
                        )
                        if (!ok) return
                        void handleDeleteOccasion(occasion._id)
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
