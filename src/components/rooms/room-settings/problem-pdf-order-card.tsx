import { useMutation, useQuery } from "convex/react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { useEffect, useState } from "react"
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

export function ProblemPdfOrderCard({ roomId }: { roomId: Id<"rooms"> }) {
  const listed = useQuery(api.PDFParse.problems.listGroupedByRoom, { roomId })
  const groups = listed?.groups
  const setProblemSortOrder = useMutation(api.files.setProblemSortOrder)

  const [orderedIds, setOrderedIds] = useState<Id<"files">[] | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (groups === undefined || dirty) return
    setOrderedIds(groups.map((group) => group.fileId))
  }, [groups, dirty])

  const namesById = new Map(
    (groups ?? []).map((group) => [group.fileId, group.fileName] as const),
  )

  const displayIds = orderedIds ?? []

  function move(index: number, direction: -1 | 1) {
    setError(null)
    setSaved(false)
    setOrderedIds((prev) => {
      const current = prev ?? []
      const target = index + direction
      if (target < 0 || target >= current.length) return prev
      const next = [...current]
      const tmp = next[index]!
      next[index] = next[target]!
      next[target] = tmp
      return next
    })
    setDirty(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ordning på uppgifts-PDF:er</CardTitle>
        <CardDescription>
          Bestäm vilken ordning PDF-grupperna visas under Uppgifter. Lägg
          huvuduppgifter högst upp och tentor längst ner.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups === undefined || orderedIds === null ? (
          <p className="text-sm text-muted-foreground">Hämtar…</p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga tolkade uppgifts-PDF:er ännu. Tolka en PDF under Filer.
          </p>
        ) : (
          <ul className="space-y-1 rounded-md border border-border p-2">
            {displayIds.map((fileId, index) => (
              <li
                key={fileId}
                className="flex items-center gap-2 rounded-md px-1 py-1 text-sm"
              >
                <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {namesById.get(fileId) ?? fileId}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 shrink-0 px-0"
                  disabled={pending || index === 0}
                  title="Flytta upp"
                  onClick={() => {
                    move(index, -1)
                  }}
                >
                  <ArrowUp className="size-3.5" />
                  <span className="sr-only">Flytta upp</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-7 shrink-0 px-0"
                  disabled={pending || index === displayIds.length - 1}
                  title="Flytta ner"
                  onClick={() => {
                    move(index, 1)
                  }}
                >
                  <ArrowDown className="size-3.5" />
                  <span className="sr-only">Flytta ner</span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {saved && !dirty ? (
          <p className="text-sm text-muted-foreground">Sparat.</p>
        ) : null}

        {groups !== undefined && groups.length > 0 ? (
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={pending || !dirty || orderedIds === null}
              onClick={() => {
                if (orderedIds === null) return
                setError(null)
                setSaved(false)
                setPending(true)
                void setProblemSortOrder({ roomId, fileIds: orderedIds })
                  .then(() => {
                    setDirty(false)
                    setSaved(true)
                  })
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Kunde inte spara ordningen",
                    )
                  })
                  .finally(() => setPending(false))
              }}
            >
              {pending ? "Sparar…" : "Spara ordning"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
