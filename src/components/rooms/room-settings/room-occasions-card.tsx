import { useMutation, useQuery } from "convex/react"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
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
import { formatOccasionLabel, unitKey } from "~/lib/occasion-label"
import { cn } from "~/lib/utils"

export function RoomOccasionsCard({ roomId }: { roomId: Id<"rooms"> }) {
  const occasions = useQuery(api.roomOccasions.listByRoom, { roomId })
  const units = useQuery(api.roomOccasions.listAssignableUnits, { roomId })
  const createOccasion = useMutation(api.roomOccasions.create)
  const updateOccasion = useMutation(api.roomOccasions.update)
  const removeOccasion = useMutation(api.roomOccasions.remove)
  const replaceAssignments = useMutation(
    api.roomOccasions.replaceOccasionAssignments,
  )

  const [name, setName] = useState("")
  const [date, setDate] = useState("")
  const [editingId, setEditingId] = useState<Id<"roomOccasions"> | null>(null)
  const [selectedId, setSelectedId] = useState<Id<"roomOccasions"> | null>(
    null,
  )
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())
  const [dirtyAssignments, setDirtyAssignments] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (occasions === undefined || occasions.length === 0) {
      setSelectedId(null)
      return
    }
    if (
      selectedId === null ||
      !occasions.some((occasion) => occasion._id === selectedId)
    ) {
      setSelectedId(occasions[0]!._id)
    }
  }, [occasions, selectedId])

  useEffect(() => {
    if (selectedId === null || occasions === undefined || dirtyAssignments) {
      return
    }
    const occasion = occasions.find((row) => row._id === selectedId)
    if (occasion === undefined) return
    setCheckedKeys(
      new Set(
        occasion.assignments.map((assignment) =>
          unitKey(
            assignment.contentHash,
            assignment.problemNumber,
            assignment.subproblemLetter,
          ),
        ),
      ),
    )
  }, [selectedId, occasions, dirtyAssignments])

  const unitsByFile = useMemo(() => {
    if (units === undefined) return []
    const groups = new Map<
      string,
      {
        fileName: string
        units: NonNullable<typeof units>
      }
    >()
    for (const unit of units) {
      const existing = groups.get(unit.fileName)
      if (existing) {
        existing.units.push(unit)
      } else {
        groups.set(unit.fileName, { fileName: unit.fileName, units: [unit] })
      }
    }
    return [...groups.values()]
  }, [units])

  const selectedOccasion =
    occasions?.find((row) => row._id === selectedId) ?? null

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
        const id = await createOccasion({ roomId, name, date })
        setSelectedId(id)
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
      if (selectedId === occasionId) {
        setSelectedId(null)
        setDirtyAssignments(false)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Kunde inte ta bort tillfället",
      )
    } finally {
      setPending(false)
    }
  }

  async function handleSaveAssignments() {
    if (selectedId === null || units === undefined) return
    setError(null)
    setSaved(false)
    setPending(true)
    try {
      const selectedUnits = units
        .filter((unit) =>
          checkedKeys.has(
            unitKey(unit.contentHash, unit.problemNumber, unit.subproblemLetter),
          ),
        )
        .map((unit) => ({
          contentHash: unit.contentHash,
          problemNumber: unit.problemNumber,
          subproblemLetter: unit.subproblemLetter,
        }))
      await replaceAssignments({
        roomId,
        occasionId: selectedId,
        units: selectedUnits,
      })
      setDirtyAssignments(false)
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte spara tilldelningarna",
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
          Skapa lektioner/dagar med namn och datum, och tilldela uppgifter
          (inkl. deluppgifter som 1.3a) till varje tillfälle. Vyn
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
              {occasions.map((occasion) => {
                const active = selectedId === occasion._id
                return (
                  <li key={occasion._id}>
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                        active && "bg-muted",
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-medium"
                        onClick={() => {
                          if (dirtyAssignments && selectedId !== occasion._id) {
                            const ok = window.confirm(
                              "Du har osparade tilldelningar. Byt tillfälle ändå?",
                            )
                            if (!ok) return
                            setDirtyAssignments(false)
                          }
                          setSelectedId(occasion._id)
                          setSaved(false)
                        }}
                      >
                        {occasion.label}
                        <span className="ml-2 font-normal text-muted-foreground tabular-nums">
                          ({occasion.assignments.length})
                        </span>
                      </button>
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
                )
              })}
            </ul>
          )}
        </div>

        {selectedOccasion !== null ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">
                  Tilldela uppgifter till {selectedOccasion.label}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Markera deluppgifter (t.ex. 1.3a). En uppgift kan bara höra
                  till ett tillfälle — om den redan är tilldelad flyttas den.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={pending || !dirtyAssignments}
                onClick={() => {
                  void handleSaveAssignments()
                }}
              >
                {pending ? <Loader2 className="animate-spin" /> : null}
                Spara tilldelning
              </Button>
            </div>

            {units === undefined ? (
              <p className="text-sm text-muted-foreground">Hämtar uppgifter…</p>
            ) : units.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Inga tolkade uppgifter ännu. Tolka en PDF under Filer.
              </p>
            ) : (
              <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-border p-2">
                {unitsByFile.map((group) => (
                  <div key={group.fileName} className="space-y-1">
                    <p className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {group.fileName}
                    </p>
                    <ul className="space-y-0.5">
                      {group.units.map((unit) => {
                        const key = unitKey(
                          unit.contentHash,
                          unit.problemNumber,
                          unit.subproblemLetter,
                        )
                        const checked = checkedKeys.has(key)
                        const otherOccasion =
                          unit.occasionId !== null &&
                          unit.occasionId !== selectedId
                            ? unit.occasionName
                            : null
                        return (
                          <li key={key}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/60",
                                checked && "bg-muted/40",
                              )}
                            >
                              <input
                                type="checkbox"
                                className="size-3.5 accent-primary"
                                checked={checked}
                                disabled={pending}
                                onChange={(event) => {
                                  setSaved(false)
                                  setDirtyAssignments(true)
                                  setCheckedKeys((prev) => {
                                    const next = new Set(prev)
                                    if (event.target.checked) {
                                      next.add(key)
                                    } else {
                                      next.delete(key)
                                    }
                                    return next
                                  })
                                }}
                              />
                              <span className="min-w-0 flex-1 truncate font-medium tabular-nums">
                                {unit.label}
                              </span>
                              {otherOccasion ? (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  nu: {otherOccasion}
                                </span>
                              ) : null}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
