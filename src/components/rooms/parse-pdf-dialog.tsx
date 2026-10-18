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

function formatTime(at: number) {
  return new Date(at).toLocaleTimeString("sv-SE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

export function ParsePdfDialog({ fileId, fileName }: ParsePdfDialogProps) {
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const status = useQuery(
    api.PDFParse.jobs.getParseStatus,
    open ? { fileId } : "skip",
  )
  const startParse = useMutation(api.PDFParse.jobs.start)

  const job = status?.job ?? null
  const alreadyParsed = status?.alreadyParsed ?? false
  const problemCount = status?.problemCount ?? 0
  const jobActive =
    job !== null && (job.status === "pending" || job.status === "running")
  const canStart = status !== undefined && !alreadyParsed && !jobActive

  async function handleStart() {
    setError(null)
    setStarting(true)
    try {
      await startParse({ fileId })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte starta tolkning")
    } finally {
      setStarting(false)
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tolka uppgifter</DialogTitle>
          <DialogDescription className="truncate" title={fileName}>
            {fileName}
          </DialogDescription>
        </DialogHeader>

        {status === undefined ? (
          <p className="text-sm text-muted-foreground">Hämtar status…</p>
        ) : alreadyParsed ? (
          <p className="text-sm text-muted-foreground">
            Denna PDF är redan tolkad.{" "}
            {problemCount === 1
              ? "1 uppgift skapades från PDF:en."
              : `${problemCount} uppgifter skapades från PDF:en.`}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {job === null ? (
              <p className="text-sm text-muted-foreground">
                Ingen tolkning har körts för denna PDF ännu.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {job.status === "failed"
                    ? "Misslyckades"
                    : job.status === "pending"
                      ? "Väntar…"
                      : "Pågår…"}
                </p>
                <ul className="max-h-48 space-y-1.5 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
                  {job.statusUpdates.map((update, index) => (
                    <li
                      key={`${update.at}-${index}`}
                      className="flex gap-2 text-sm"
                    >
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {formatTime(update.at)}
                      </span>
                      <span>{update.message}</span>
                    </li>
                  ))}
                </ul>
                {jobActive ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Uppdateras live…
                  </p>
                ) : null}
              </div>
            )}

            {canStart ? (
              <Button
                disabled={starting}
                onClick={() => {
                  void handleStart()
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
                  "Tolka uppgifter"
                )}
              </Button>
            ) : null}
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
