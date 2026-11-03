import { useMutation, useQuery } from "convex/react"
import { ArchiveRestore } from "lucide-react"
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
import { formatDateTime } from "./shared"

export function ArchivedThreadsCard({ roomId }: { roomId: Id<"rooms"> }) {
  const archivedThreads = useQuery(api.threads.listArchivedByRoom, { roomId })
  const unarchiveThread = useMutation(api.threads.unarchive)

  const [unarchivingThreadId, setUnarchivingThreadId] = useState<string | null>(
    null,
  )
  const [archiveError, setArchiveError] = useState<string | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arkiverade chattar</CardTitle>
        <CardDescription>
          Chattar som arkiverats manuellt eller efter utgångstid. Återställ dem
          för att visa dem i chattlistan igen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {archiveError ? (
          <p className="text-sm text-destructive">{archiveError}</p>
        ) : null}

        {archivedThreads === undefined ? (
          <p className="text-sm text-muted-foreground">
            Hämtar arkiverade chattar…
          </p>
        ) : archivedThreads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga arkiverade chattar.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {archivedThreads.map((thread) => (
              <li
                key={thread._id}
                className="flex items-center gap-3 px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{thread.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    Skapad {formatDateTime(thread._creationTime)}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    Arkiverad {formatDateTime(thread.archivedAt)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={unarchivingThreadId !== null}
                  aria-label={`Återställ ${thread.title}`}
                  onClick={() => {
                    setArchiveError(null)
                    setUnarchivingThreadId(thread.threadId)
                    void unarchiveThread({
                      roomId,
                      threadId: thread.threadId,
                    })
                      .catch((err: unknown) => {
                        setArchiveError(
                          err instanceof Error
                            ? err.message
                            : "Kunde inte återställa chatten",
                        )
                      })
                      .finally(() => setUnarchivingThreadId(null))
                  }}
                >
                  <ArchiveRestore />
                  {unarchivingThreadId === thread.threadId
                    ? "Återställer…"
                    : "Återställ"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
