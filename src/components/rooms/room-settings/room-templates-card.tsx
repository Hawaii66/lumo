import { useMutation, useQuery } from "convex/react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { cn } from "~/lib/utils"
import { formatDateTime } from "./shared"

export function RoomTemplatesCard({ roomId }: { roomId: Id<"rooms"> }) {
  const publishedTemplates = useQuery(api.roomTemplates.listBySourceRoom, {
    roomId,
  })
  const publishFromRoom = useMutation(api.roomTemplates.publishFromRoom)
  const setExpired = useMutation(api.roomTemplates.setExpired)

  const [templateError, setTemplateError] = useState<string | null>(null)
  const [publishPending, setPublishPending] = useState(false)
  const [expireTemplateId, setExpireTemplateId] =
    useState<Id<"roomTemplates"> | null>(null)
  const [replacementSearch, setReplacementSearch] = useState("")
  const [replacementQuery, setReplacementQuery] = useState("")
  const [selectedReplacementId, setSelectedReplacementId] = useState<
    Id<"roomTemplates"> | null
  >(null)
  const [expirePending, setExpirePending] = useState(false)

  const replacementCandidates = useQuery(
    api.roomTemplates.search,
    expireTemplateId !== null ? { query: replacementQuery } : "skip",
  )

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Rumsmallar</CardTitle>
          <CardDescription>
            Publicera en ögonblicksbild av rummet (filer, uppgifter via PDF,
            namn, beskrivning och kursinformation) som andra kan söka upp och
            klona. Ändringar i rummet synkas inte till redan klonade rum.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {templateError ? (
            <p className="text-sm text-destructive">{templateError}</p>
          ) : null}

          <Button
            type="button"
            disabled={publishPending}
            onClick={() => {
              setTemplateError(null)
              setPublishPending(true)
              void publishFromRoom({ roomId })
                .catch((err: unknown) => {
                  setTemplateError(
                    err instanceof Error
                      ? err.message
                      : "Kunde inte publicera mall",
                  )
                })
                .finally(() => setPublishPending(false))
            }}
          >
            {publishPending ? "Publicerar…" : "Publicera som mall"}
          </Button>

          {publishedTemplates === undefined ? (
            <p className="text-sm text-muted-foreground">Hämtar mallar…</p>
          ) : publishedTemplates === null ? (
            <p className="text-sm text-muted-foreground">
              Kunde inte hämta mallar.
            </p>
          ) : publishedTemplates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga mallar publicerade från det här rummet ännu.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {publishedTemplates.map((template) => (
                <li
                  key={template._id}
                  className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate font-medium">{template.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {template.status === "published"
                        ? "Publicerad"
                        : "Utgången"}
                      {` · ${template.fileCount} fil${template.fileCount === 1 ? "" : "er"}`}
                      {` · ${formatDateTime(template.publishedAt)}`}
                    </p>
                    {template.status === "expired" &&
                    template.replacementName ? (
                      <p className="text-xs text-muted-foreground">
                        Ersättning: {template.replacementName}
                      </p>
                    ) : null}
                  </div>
                  {template.status === "published" && template.isPublisher ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        setTemplateError(null)
                        setExpireTemplateId(template._id)
                        setSelectedReplacementId(null)
                        setReplacementSearch("")
                        setReplacementQuery("")
                      }}
                    >
                      Markera som utgången
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={expireTemplateId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setExpireTemplateId(null)
            setSelectedReplacementId(null)
            setReplacementSearch("")
            setReplacementQuery("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Markera mall som utgången</DialogTitle>
            <DialogDescription>
              Utgångna mallar syns inte i sökningen. Rum som klonats från mallen
              får en banner. Du kan valfritt koppla en ersättningsmall som visas
              i bannern.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Label htmlFor="replacement-search">
              Ersättningsmall (valfritt)
            </Label>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                setReplacementQuery(replacementSearch.trim())
              }}
            >
              <Input
                id="replacement-search"
                value={replacementSearch}
                onChange={(e) => setReplacementSearch(e.target.value)}
                placeholder="Sök publicerad mall…"
              />
              <Button type="submit" variant="outline">
                Sök
              </Button>
            </form>

            {selectedReplacementId !== null ? (
              <p className="text-sm text-muted-foreground">
                Vald ersättning:{" "}
                {replacementCandidates?.find(
                  (t) => t._id === selectedReplacementId,
                )?.name ?? selectedReplacementId}
                {" · "}
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => setSelectedReplacementId(null)}
                >
                  Rensa
                </button>
              </p>
            ) : null}

            {replacementCandidates === undefined &&
            expireTemplateId !== null ? (
              <p className="text-sm text-muted-foreground">Hämtar…</p>
            ) : replacementCandidates && replacementCandidates.length > 0 ? (
              <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {replacementCandidates
                  .filter((t) => t._id !== expireTemplateId)
                  .map((candidate) => (
                    <li key={candidate._id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted/60",
                          selectedReplacementId === candidate._id
                            ? "bg-muted"
                            : null,
                        )}
                        onClick={() =>
                          setSelectedReplacementId(candidate._id)
                        }
                      >
                        <span className="font-medium">{candidate.name}</span>
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {candidate.description}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>

          {templateError ? (
            <p className="text-sm text-destructive">{templateError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExpireTemplateId(null)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              disabled={expirePending || expireTemplateId === null}
              onClick={() => {
                if (expireTemplateId === null) return
                setTemplateError(null)
                setExpirePending(true)
                void setExpired({
                  templateId: expireTemplateId,
                  ...(selectedReplacementId !== null
                    ? { replacementTemplateId: selectedReplacementId }
                    : {}),
                })
                  .then(() => {
                    setExpireTemplateId(null)
                    setSelectedReplacementId(null)
                  })
                  .catch((err: unknown) => {
                    setTemplateError(
                      err instanceof Error
                        ? err.message
                        : "Kunde inte markera mallen som utgången",
                    )
                  })
                  .finally(() => setExpirePending(false))
              }}
            >
              {expirePending ? "Sparar…" : "Markera som utgången"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
