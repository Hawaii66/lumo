import { useMutation, useQuery } from "convex/react"
import { Loader2, Plus, Trash2 } from "lucide-react"
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

export function CourseInfoCellsCard({ roomId }: { roomId: Id<"rooms"> }) {
  const inUseCells = useQuery(api.PDFParse.pdfInfo.listInUseByRoom, { roomId })
  const availableCells = useQuery(api.PDFParse.pdfInfo.listAvailableByRoom, {
    roomId,
  })
  const addInfoCell = useMutation(api.PDFParse.pdfInfo.addToRoom)
  const removeInfoCell = useMutation(api.PDFParse.pdfInfo.removeFromRoom)

  const [infoError, setInfoError] = useState<string | null>(null)
  const [infoBusyHash, setInfoBusyHash] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kursinformation från PDF:er</CardTitle>
        <CardDescription>
          Vilka metoder som förväntas i kursen (inte enskilda uppgifter). Tolka
          under Filer → Tolka → Tolka kursinformation. Cellerna kan inte
          redigeras; ta bort hela cellen om den inte ska användas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {infoError ? (
          <p className="text-sm text-destructive">{infoError}</p>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Används i rummet</h3>
          {inUseCells === undefined ? (
            <p className="text-sm text-muted-foreground">Hämtar…</p>
          ) : inUseCells.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga informationsceller tillagda ännu.
            </p>
          ) : (
            <ul className="space-y-3">
              {inUseCells.map((cell) => (
                <li
                  key={cell.contentHash}
                  className="rounded-md border border-border p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p
                      className="truncate text-sm font-medium"
                      title={cell.fileName}
                    >
                      {cell.fileName}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 text-muted-foreground"
                      aria-label={`Ta bort information från ${cell.fileName}`}
                      disabled={infoBusyHash !== null}
                      onClick={() => {
                        setInfoError(null)
                        setInfoBusyHash(cell.contentHash)
                        void removeInfoCell({
                          roomId,
                          contentHash: cell.contentHash,
                        })
                          .catch((err: unknown) => {
                            setInfoError(
                              err instanceof Error
                                ? err.message
                                : "Kunde inte ta bort cellen",
                            )
                          })
                          .finally(() => setInfoBusyHash(null))
                      }}
                    >
                      {infoBusyHash === cell.contentHash ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {cell.text.length > 0 ? cell.text : "(Tom information)"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Tillgängliga</h3>
          {availableCells === undefined ? (
            <p className="text-sm text-muted-foreground">Hämtar…</p>
          ) : availableCells.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Inga tolkade PDF:er att lägga till. Tolka kursinformation från en
              lämplig PDF under Filer.
            </p>
          ) : (
            <ul className="space-y-3">
              {availableCells.map((cell) => (
                <li
                  key={cell.contentHash}
                  className="rounded-md border border-border border-dashed p-3"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <p
                      className="truncate text-sm font-medium"
                      title={cell.fileName}
                    >
                      {cell.fileName}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={infoBusyHash !== null}
                      onClick={() => {
                        setInfoError(null)
                        setInfoBusyHash(cell.contentHash)
                        void addInfoCell({
                          roomId,
                          contentHash: cell.contentHash,
                        })
                          .catch((err: unknown) => {
                            setInfoError(
                              err instanceof Error
                                ? err.message
                                : "Kunde inte lägga till cellen",
                            )
                          })
                          .finally(() => setInfoBusyHash(null))
                      }}
                    >
                      {infoBusyHash === cell.contentHash ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Plus />
                      )}
                      Lägg till
                    </Button>
                  </div>
                  <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">
                    {cell.text.length > 0 ? cell.text : "(Tom information)"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
