import { useMutation, useQuery } from "convex/react"
import { ListChecks, Plus, Sparkles, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type {PageRange} from "~/lib/merge-pdf-pages";
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import {
  
  getPdfPageCount,
  mergePdfPageRanges
} from "~/lib/merge-pdf-pages"

type ParsePdfDialogProps = {
  roomId: Id<"rooms">
  fileId: Id<"files">
  fileName: string
  fileUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function emptyRange(): PageRange {
  return { start: 1, end: 1 }
}

function formatRanges(ranges: Array<PageRange>): string {
  return ranges.map((r) => `${r.start}–${r.end}`).join(", ")
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Köad"
    case "hashing":
      return "Hashar PDF…"
    case "extracting":
      return "Extraherar uppgifter…"
    case "converting":
      return "Formaterar uppgifter…"
    case "completed":
      return "Klar"
    case "failed":
      return "Misslyckades"
    default:
      return status
  }
}

function segmentPreview(
  segments: Array<{ type: string; content: string }>,
): string {
  if (segments.length === 0) return "—"
  return segments
    .map((segment) => {
      if (segment.type === "subproblem") return `[${segment.content}]`
      if (segment.type === "latex") return `$${segment.content}$`
      return segment.content
    })
    .join("")
    .slice(0, 160)
}

export function ParsePdfDialog({
  roomId,
  fileId,
  fileName,
  fileUrl,
  open,
  onOpenChange,
}: ParsePdfDialogProps) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const startParse = useMutation(api.parseJobs.start)
  const jobs = useQuery(api.parseJobs.listByRoom, open ? { roomId } : "skip")
  const problems = useQuery(api.problems.listByRoom, open ? { roomId } : "skip")
  const completedPages = useQuery(
    api.parsedPages.listByFile,
    open ? { fileId, roomId } : "skip",
  )

  const [ranges, setRanges] = useState<Array<PageRange>>([emptyRange()])
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    const abort = new AbortController()
    setLoadingMeta(true)
    setError(null)

    void (async () => {
      try {
        const response = await fetch(fileUrl, { signal: abort.signal })
        if (!response.ok) {
          throw new Error("Kunde inte läsa PDF:en")
        }
        const bytes = await response.arrayBuffer()
        const count = await getPdfPageCount(bytes)
        setPageCount(count)
        setRanges([{ start: 1, end: Math.min(3, count) }])
      } catch (err: unknown) {
        if (abort.signal.aborted) return
        setError(err instanceof Error ? err.message : "Kunde inte läsa PDF")
        setPageCount(null)
      } finally {
        if (!abort.signal.aborted) setLoadingMeta(false)
      }
    })()

    return () => {
      abort.abort()
    }
  }, [open, fileUrl])

  function updateRange(index: number, patch: Partial<PageRange>) {
    setRanges((prev) =>
      prev.map((range, i) => (i === index ? { ...range, ...patch } : range)),
    )
  }

  async function handleStart() {
    if (pageCount === null) return

    setError(null)
    setSubmitting(true)
    try {
      const response = await fetch(fileUrl)
      if (!response.ok) {
        throw new Error("Kunde inte läsa PDF:en")
      }
      const sourceBytes = await response.arrayBuffer()
      const merged = await mergePdfPageRanges(sourceBytes, ranges)
      const blob = new Blob([Uint8Array.from(merged)], {
        type: "application/pdf",
      })

      const uploadUrl = await generateUploadUrl({ roomId })
      const uploadResult = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "application/pdf" },
        body: blob,
      })
      if (!uploadResult.ok) {
        throw new Error("Kunde inte ladda upp den sammanslagna PDF:en")
      }
      const { storageId } = (await uploadResult.json()) as {
        storageId: Id<"_storage">
      }

      await startParse({
        roomId,
        fileId,
        mergedStorageId: storageId,
        pageRanges: ranges,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte starta tolkning")
    } finally {
      setSubmitting(false)
    }
  }

  const fileJobs =
    jobs?.filter((job) => job.fileId === fileId).slice(0, 5) ?? []
  const fileProblems =
    problems?.filter((problem) => problem.fileId === fileId).slice(0, 20) ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tolka uppgifter</DialogTitle>
          <DialogDescription>
            Välj sidintervall från “{fileName}”. Intervallerna slås ihop till en
            PDF som AI:n läser. Hashen tas från originalfilen.
          </DialogDescription>
        </DialogHeader>

        {loadingMeta ? (
          <p className="text-sm text-muted-foreground">Läser PDF…</p>
        ) : null}

        {pageCount !== null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              PDF:en har {pageCount} sidor. Lägg till intervall för uppgifter och
              facit (t.ex. 3–5 och 13–14).
            </p>

            <ul className="flex flex-col gap-2">
              {ranges.map((range, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={range.start}
                    onChange={(event) =>
                      updateRange(index, {
                        start: Number(event.target.value),
                      })
                    }
                    className="w-20"
                    aria-label={`Intervall ${index + 1} start`}
                  />
                  <span className="text-sm text-muted-foreground">till</span>
                  <Input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={range.end}
                    onChange={(event) =>
                      updateRange(index, {
                        end: Number(event.target.value),
                      })
                    }
                    className="w-20"
                    aria-label={`Intervall ${index + 1} slut`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={ranges.length === 1}
                    onClick={() =>
                      setRanges((prev) => prev.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                setRanges((prev) => [
                  ...prev,
                  {
                    start: Math.min(pageCount, 1),
                    end: Math.min(pageCount, 1),
                  },
                ])
              }
            >
              <Plus />
              Lägg till intervall
            </Button>

            {completedPages !== undefined && completedPages.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                Redan tolkade sidor (skippas nästa gång):{" "}
                {completedPages.join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {fileJobs.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="size-4" />
              Senaste jobb
            </h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {fileJobs.map((job) => (
                <li key={job._id} className="text-muted-foreground">
                  <span className="text-foreground">
                    {statusLabel(job.status)}
                  </span>
                  {" · "}
                  {formatRanges(job.pageRanges)}
                  {job.problemCount !== undefined
                    ? ` · ${job.problemCount} nya`
                    : null}
                  {job.skippedCount !== undefined && job.skippedCount > 0
                    ? ` · ${job.skippedCount} uppgifter redan tolkade`
                    : null}
                  {job.skippedPageCount !== undefined &&
                  job.skippedPageCount > 0
                    ? ` · ${job.skippedPageCount} sidor hoppades över`
                    : null}
                  {job.error ? (
                    <span className="block text-destructive">{job.error}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {fileProblems.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <ListChecks className="size-4" />
              Tolkade uppgifter
            </h3>
            <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto text-sm">
              {fileProblems.map((problem) => (
                <li key={problem._id}>
                  <span className="font-medium">
                    {problem.problemNumber}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    ({problem.status}) —{" "}
                    {segmentPreview(problem.segments)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={submitting} />}>
            Stäng
          </DialogClose>
          <Button
            disabled={
              submitting || loadingMeta || pageCount === null || ranges.length === 0
            }
            onClick={() => {
              void handleStart()
            }}
          >
            <Sparkles />
            {submitting ? "Startar…" : "Starta tolkning"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
