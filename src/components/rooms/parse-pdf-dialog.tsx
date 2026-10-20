import { useMutation, useQuery } from "convex/react"
import { Loader2, ScanSearch } from "lucide-react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"

type ParsePdfDialogProps = {
  fileId: Id<"files">
  fileName: string
}

type ParseKind = "problems" | "info"

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Matches "Tolkar uppgifter med AI… 3/12 (25%)" from the job runner. */
function parseAgentProgress(
  updates: { message: string }[],
): { completed: number; total: number; percent: number } | null {
  for (let i = updates.length - 1; i >= 0; i--) {
    const match = updates[i]?.message.match(
      /(\d+)\s*\/\s*(\d+)\s*\((\d+)%\)/,
    )
    if (match) {
      return {
        completed: Number(match[1]),
        total: Number(match[2]),
        percent: Number(match[3]),
      }
    }
  }
  return null
}

export function ParsePdfDialog({ fileId, fileName }: ParsePdfDialogProps) {
  const [open, setOpen] = useState(false)
  const [startingKind, setStartingKind] = useState<ParseKind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const status = useQuery(
    api.PDFParse.jobs.getParseStatus,
    open ? { fileId } : "skip",
  )
  const startParse = useMutation(api.PDFParse.jobs.start)

  async function handleStart(kind: ParseKind) {
    setError(null)
    setStartingKind(kind)
    try {
      await startParse({ fileId, kind })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte starta tolkning")
    } finally {
      setStartingKind(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ScanSearch />
        Tolka
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tolka PDF</DialogTitle>
          <DialogDescription className="truncate" title={fileName}>
            {fileName}
          </DialogDescription>
        </DialogHeader>

        {status === undefined ? (
          <p className="text-sm text-muted-foreground">Hämtar status…</p>
        ) : status === null ? (
          <p className="text-sm text-muted-foreground">
            PDF-filen hittades inte.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {status.kinds.map((kindStatus) => {
              const job = kindStatus.job
              const jobActive =
                job !== null &&
                (job.status === "pending" || job.status === "running")
              const canStart =
                !kindStatus.alreadyDone && !jobActive
              const agentProgress =
                job !== null ? parseAgentProgress(job.statusUpdates) : null
              const starting = startingKind === kindStatus.kind

              return (
                <div
                  key={kindStatus.kind}
                  className="flex flex-col gap-2 rounded-md border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{kindStatus.label}</p>
                      {kindStatus.alreadyDone ? (
                        <p className="text-sm text-muted-foreground">
                          Klar
                          {kindStatus.summary
                            ? ` — ${kindStatus.summary}`
                            : ""}
                        </p>
                      ) : job === null ? (
                        <p className="text-sm text-muted-foreground">
                          Inte körd ännu
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {job.status === "failed"
                            ? "Misslyckades"
                            : job.status === "pending"
                              ? "Väntar…"
                              : agentProgress !== null
                                ? `Pågår… ${agentProgress.completed}/${agentProgress.total} (${agentProgress.percent}%)`
                                : "Pågår…"}
                        </p>
                      )}
                    </div>
                    {canStart ? (
                      <Button
                        size="sm"
                        disabled={startingKind !== null}
                        onClick={() => {
                          void handleStart(kindStatus.kind)
                        }}
                      >
                        {starting ? (
                          <>
                            <Loader2 className="animate-spin" />
                            Startar…
                          </>
                        ) : job?.status === "failed" ? (
                          "Försök igen"
                        ) : (
                          "Starta"
                        )}
                      </Button>
                    ) : null}
                  </div>

                  {job !== null && !kindStatus.alreadyDone ? (
                    <div className="flex flex-col gap-2">
                      <ul className="max-h-36 space-y-1.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-2">
                        {job.statusUpdates.map((update, index) => (
                          <li
                            key={`${kindStatus.kind}-${update.at}-${index}`}
                            className="flex gap-2 text-xs"
                          >
                            <span className="shrink-0 tabular-nums text-muted-foreground">
                              {formatTime(update.at)}
                            </span>
                            <span>{update.message}</span>
                          </li>
                        ))}
                      </ul>
                      {jobActive ? (
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          Uppdateras live…
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Stäng</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
