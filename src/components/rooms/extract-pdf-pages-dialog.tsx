import { useAction, useMutation, useQuery } from "convex/react"
import { Loader2, Plus, Scissors, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  formatPageRanges,
  MAX_EXTRACT_RANGES,
} from "../../../convex/lib/pdfExtract"
import { MAX_FILE_NAME_LENGTH } from "../../../convex/lib/roomFiles"
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
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import {
  countPagesInRanges,
  extractPdfPages,
  getPdfPageCount,
  type PageRange,
  validatePageRangesAgainstCount,
} from "~/lib/extractPdfPages"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

type RoomPdf = {
  _id: Id<"files">
  name: string
  contentHash: string
  url: string | null
}

type RangeDraft = {
  key: string
  start: string
  end: string
}

type ExtractPdfPagesDialogProps = {
  roomId: Id<"rooms">
  pdfs: RoomPdf[]
}

function newRangeDraft(): RangeDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    start: "",
    end: "",
  }
}

function parseRanges(drafts: RangeDraft[]): PageRange[] | null {
  const ranges: PageRange[] = []
  for (const draft of drafts) {
    const startRaw = draft.start.trim()
    const endRaw = draft.end.trim()
    if (startRaw === "" && endRaw === "") {
      continue
    }
    if (startRaw === "" || endRaw === "") {
      return null
    }
    const start = Number(startRaw)
    const end = Number(endRaw)
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return null
    }
    ranges.push({ start, end })
  }
  return ranges.length > 0 ? ranges : null
}

function defaultNameBase(sourceName: string): string {
  const withoutExt = sourceName.replace(/\.pdf$/i, "")
  const base = `${withoutExt}-utdrag`
  return base.slice(0, Math.max(1, MAX_FILE_NAME_LENGTH - 4))
}

export function ExtractPdfPagesDialog({
  roomId,
  pdfs,
}: ExtractPdfPagesDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<Id<"files"> | null>(null)
  const [ranges, setRanges] = useState<RangeDraft[]>([newRangeDraft()])
  const [nameBase, setNameBase] = useState("utdrag")
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [busy, setBusy] = useState<"attach" | "extract" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const saveFile = useMutation(api.files.save)
  const registerExtract = useMutation(api.pdfExtracts.register)
  const attachToRoom = useAction(api.pdfExtracts.attachToRoom)

  const selectedPdf = useMemo(
    () => pdfs.find((p) => p._id === selectedId) ?? null,
    [pdfs, selectedId],
  )

  const parsedRanges = useMemo(() => parseRanges(ranges), [ranges])

  const validationError = useMemo(() => {
    if (parsedRanges === null) {
      const anyPartial = ranges.some((r) => {
        const s = r.start.trim()
        const e = r.end.trim()
        return (s === "") !== (e === "") || (s !== "" && e !== "" && (
          !Number.isInteger(Number(s)) || !Number.isInteger(Number(e))
        ))
      })
      if (anyPartial) {
        return "Fyll i både start och slut med heltal"
      }
      return null
    }
    if (pageCount === null) {
      return null
    }
    try {
      validatePageRangesAgainstCount(parsedRanges, pageCount)
      return null
    } catch (err: unknown) {
      return err instanceof Error ? err.message : "Ogiltiga sidintervall"
    }
  }, [parsedRanges, pageCount, ranges])

  const existingExtract = useQuery(
    api.pdfExtracts.findBySourceAndRanges,
    open &&
      selectedPdf !== null &&
      parsedRanges !== null &&
      validationError === null
      ? {
          roomId,
          sourceContentHash: selectedPdf.contentHash,
          pageRanges: parsedRanges,
        }
      : "skip",
  )

  useEffect(() => {
    if (!open || selectedPdf === null || selectedPdf.url === null) {
      setPageCount(null)
      return
    }

    let cancelled = false
    setLoadingCount(true)
    setError(null)

    void (async () => {
      try {
        const response = await fetch(selectedPdf.url!)
        if (!response.ok) {
          throw new Error(`Kunde inte hämta “${selectedPdf.name}”`)
        }
        const bytes = await response.arrayBuffer()
        const count = await getPdfPageCount(bytes)
        if (!cancelled) {
          setPageCount(count)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setPageCount(null)
          setError(
            err instanceof Error
              ? err.message
              : "Kunde inte läsa PDF:ens sidantal",
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingCount(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, selectedPdf])

  function resetState() {
    setSelectedId(null)
    setRanges([newRangeDraft()])
    setNameBase("utdrag")
    setPageCount(null)
    setLoadingCount(false)
    setError(null)
    setBusy(null)
  }

  function selectPdf(fileId: Id<"files">) {
    setError(null)
    setSelectedId(fileId)
    const pdf = pdfs.find((p) => p._id === fileId)
    if (pdf !== undefined) {
      setNameBase(defaultNameBase(pdf.name))
    }
  }

  function updateRange(key: string, field: "start" | "end", value: string) {
    setError(null)
    setRanges((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    )
  }

  function addRange() {
    setError(null)
    setRanges((prev) => {
      if (prev.length >= MAX_EXTRACT_RANGES) {
        return prev
      }
      return [...prev, newRangeDraft()]
    })
  }

  function removeRange(key: string) {
    setError(null)
    setRanges((prev) => {
      if (prev.length <= 1) {
        return [newRangeDraft()]
      }
      return prev.filter((r) => r.key !== key)
    })
  }

  function extractedFileName(): string {
    const base = nameBase.trim() || "utdrag"
    return `${base}.pdf`
  }

  const canStart =
    selectedPdf !== null &&
    selectedPdf.url !== null &&
    parsedRanges !== null &&
    validationError === null &&
    pageCount !== null &&
    !loadingCount &&
    busy === null

  async function handleUseExisting() {
    if (existingExtract === null || existingExtract === undefined) {
      return
    }
    setBusy("attach")
    setError(null)
    try {
      await attachToRoom({
        roomId,
        extractId: existingExtract._id,
        name: extractedFileName(),
      })
      setOpen(false)
      resetState()
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte lägga till den extraherade filen",
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleExtractFresh() {
    if (!canStart || selectedPdf === null || parsedRanges === null) {
      return
    }

    setBusy("extract")
    setError(null)
    try {
      if (selectedPdf.url === null) {
        throw new Error(`PDF:en “${selectedPdf.name}” är otillgänglig`)
      }
      const response = await fetch(selectedPdf.url)
      if (!response.ok) {
        throw new Error(`Kunde inte hämta “${selectedPdf.name}”`)
      }
      const bytes = await response.arrayBuffer()
      const extractedBytes = await extractPdfPages(bytes, parsedRanges)
      const file = new File(
        [new Uint8Array(extractedBytes)],
        extractedFileName(),
        { type: "application/pdf" },
      )

      const storageId = await uploadFileToStorage(file, () =>
        generateUploadUrl({ roomId }),
      )
      await saveFile({ roomId, name: file.name, storageId })
      await registerExtract({
        roomId,
        sourceContentHash: selectedPdf.contentHash,
        pageRanges: parsedRanges,
        extractedStorageId: storageId,
      })

      setOpen(false)
      resetState()
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte extrahera sidorna",
      )
    } finally {
      setBusy(null)
    }
  }

  const hasExisting =
    existingExtract !== null && existingExtract !== undefined

  const previewLabel =
    parsedRanges !== null && validationError === null
      ? `s. ${formatPageRanges(parsedRanges)} (${countPagesInRanges(parsedRanges)} sidor)`
      : null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          resetState()
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" disabled={pdfs.length < 1} />
        }
      >
        <Scissors />
        Extrahera sidor
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Extrahera sidor</DialogTitle>
          <DialogDescription>
            Välj en PDF och ett eller flera sidintervall (t.ex. 1–3 och
            10–12). Intervallen får inte överlappa.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">PDF i rummet</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {pdfs.map((pdf) => {
                const selected = selectedId === pdf._id
                return (
                  <li key={pdf._id}>
                    <button
                      type="button"
                      disabled={busy !== null || pdf.url === null}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        selected
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted/60",
                        (busy !== null || pdf.url === null) && "opacity-50",
                      )}
                      onClick={() => {
                        selectPdf(pdf._id)
                      }}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded border text-[10px]",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border",
                        )}
                        aria-hidden
                      >
                        {selected ? "✓" : ""}
                      </span>
                      <span className="min-w-0 truncate">{pdf.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {selectedPdf !== null ? (
              <p className="text-xs text-muted-foreground">
                {loadingCount
                  ? "Läser sidantal…"
                  : pageCount !== null
                    ? `${pageCount} sidor`
                    : null}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Sidintervall</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={
                  busy !== null || ranges.length >= MAX_EXTRACT_RANGES
                }
                onClick={addRange}
              >
                <Plus className="size-3.5" />
                Lägg till
              </Button>
            </div>
            <ul className="space-y-2">
              {ranges.map((range) => (
                <li
                  key={range.key}
                  className="flex items-center gap-2"
                >
                  <Label className="sr-only" htmlFor={`start-${range.key}`}>
                    Från
                  </Label>
                  <Input
                    id={`start-${range.key}`}
                    inputMode="numeric"
                    placeholder="Från"
                    value={range.start}
                    disabled={busy !== null}
                    className="w-20"
                    onChange={(event) => {
                      updateRange(range.key, "start", event.target.value)
                    }}
                  />
                  <span className="text-sm text-muted-foreground">–</span>
                  <Label className="sr-only" htmlFor={`end-${range.key}`}>
                    Till
                  </Label>
                  <Input
                    id={`end-${range.key}`}
                    inputMode="numeric"
                    placeholder="Till"
                    value={range.end}
                    disabled={busy !== null}
                    className="w-20"
                    onChange={(event) => {
                      updateRange(range.key, "end", event.target.value)
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-8 shrink-0 px-0"
                    disabled={busy !== null}
                    title="Ta bort intervall"
                    onClick={() => {
                      removeRange(range.key)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">Ta bort</span>
                  </Button>
                </li>
              ))}
            </ul>
            {previewLabel ? (
              <p className="text-xs text-muted-foreground">{previewLabel}</p>
            ) : null}
            {validationError ? (
              <p className="text-sm text-destructive">{validationError}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="extract-pdf-name">Filnamn</Label>
            <div className="flex items-center gap-1.5">
              <Input
                id="extract-pdf-name"
                value={nameBase}
                maxLength={Math.max(1, MAX_FILE_NAME_LENGTH - 4)}
                disabled={busy !== null}
                onChange={(event) => {
                  setNameBase(event.target.value.replace(/\.pdf$/i, ""))
                }}
              />
              <span className="shrink-0 text-sm text-muted-foreground">
                .pdf
              </span>
            </div>
          </div>

          {hasExisting ? (
            <p className="text-sm text-muted-foreground">
              Samma sidintervall har extraherats tidigare från denna PDF. Du
              kan återanvända den filen.
            </p>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <DialogClose
            render={<Button variant="outline" disabled={busy !== null} />}
          >
            Avbryt
          </DialogClose>
          {hasExisting ? (
            <>
              <Button
                variant="outline"
                disabled={!canStart}
                onClick={() => {
                  void handleExtractFresh()
                }}
              >
                {busy === "extract" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Extraherar…
                  </>
                ) : (
                  "Extrahera igen"
                )}
              </Button>
              <Button
                disabled={busy !== null}
                onClick={() => void handleUseExisting()}
              >
                {busy === "attach" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Lägger till…
                  </>
                ) : (
                  "Använd befintlig"
                )}
              </Button>
            </>
          ) : (
            <Button
              disabled={!canStart}
              onClick={() => {
                void handleExtractFresh()
              }}
            >
              {busy === "extract" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Extraherar…
                </>
              ) : (
                "Extrahera"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
