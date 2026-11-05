import { useMutation, useQuery } from "convex/react"
import {
  ArrowDown,
  ArrowUp,
  Combine,
  FileUp,
  Loader2,
  Plus,
  Scissors,
  Trash2,
  X,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "@tanstack/react-router"
import { api } from "../../../convex/_generated/api"
import {
  formatPageRanges,
  MAX_EXTRACT_RANGES,
} from "../../../convex/lib/pdfExtract"
import {
  MAX_MERGE_INPUTS,
  MIN_MERGE_INPUTS,
} from "../../../convex/lib/pdfMerge"
import { MAX_FILE_NAME_LENGTH } from "../../../convex/lib/roomFiles"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { downloadBlob } from "~/lib/downloadBlob"
import {
  countPagesInRanges,
  extractPdfPages,
  getPdfPageCount,
  type PageRange,
  validatePageRangesAgainstCount,
} from "~/lib/extractPdfPages"
import { mergePdfBlobs } from "~/lib/mergePdfs"
import { sha256Hex } from "~/lib/sha256"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

type LocalPdf = {
  id: string
  name: string
  bytes: ArrayBuffer
  contentHash: string
}

type RangeDraft = {
  key: string
  start: string
  end: string
}

function newLocalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function newRangeDraft(): RangeDraft {
  return {
    key: newLocalId(),
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

function defaultExtractNameBase(sourceName: string): string {
  const withoutExt = sourceName.replace(/\.pdf$/i, "")
  const base = `${withoutExt}-utdrag`
  return base.slice(0, Math.max(1, MAX_FILE_NAME_LENGTH - 4))
}

function isPdfFile(file: File): boolean {
  const type = file.type.toLowerCase()
  if (type === "application/pdf") return true
  return file.name.toLowerCase().endsWith(".pdf")
}

async function fileToLocalPdf(file: File): Promise<LocalPdf> {
  const bytes = await file.arrayBuffer()
  const contentHash = await sha256Hex(bytes)
  return {
    id: newLocalId(),
    name: file.name,
    bytes,
    contentHash,
  }
}

function pdfFileName(base: string, fallback: string): string {
  const trimmed = base.trim() || fallback
  return trimmed.toLowerCase().endsWith(".pdf") ? trimmed : `${trimmed}.pdf`
}

async function loadPdfsFromInput(
  fileList: FileList | null,
): Promise<{ pdfs: LocalPdf[]; error: string | null }> {
  if (fileList === null || fileList.length === 0) {
    return { pdfs: [], error: null }
  }
  const pdfs: LocalPdf[] = []
  for (const file of Array.from(fileList)) {
    if (!isPdfFile(file)) {
      return {
        pdfs: [],
        error: `“${file.name}” är inte en PDF`,
      }
    }
    pdfs.push(await fileToLocalPdf(file))
  }
  return { pdfs, error: null }
}

function MergePanel() {
  const [pdfs, setPdfs] = useState<LocalPdf[]>([])
  const [orderedIds, setOrderedIds] = useState<string[]>([])
  const [nameBase, setNameBase] = useState("sammanslagen")
  const [busy, setBusy] = useState<"download" | "merge" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generateUploadUrl = useMutation(api.pdfTools.generateUploadUrl)
  const registerMerge = useMutation(api.pdfMerges.register)

  const selectedPdfs = useMemo(() => {
    const byId = new Map(pdfs.map((p) => [p.id, p] as const))
    return orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is LocalPdf => p !== undefined)
  }, [orderedIds, pdfs])

  const inputHashes = selectedPdfs.map((p) => p.contentHash)

  const existingMerge = useQuery(
    api.pdfMerges.findByInputHashes,
    inputHashes.length >= MIN_MERGE_INPUTS ? { inputHashes } : "skip",
  )

  const canStart =
    selectedPdfs.length >= MIN_MERGE_INPUTS &&
    selectedPdfs.length <= MAX_MERGE_INPUTS &&
    busy === null

  function togglePdf(id: string) {
    setError(null)
    setOrderedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      }
      if (prev.length >= MAX_MERGE_INPUTS) {
        return prev
      }
      return [...prev, id]
    })
  }

  function moveSelected(index: number, direction: -1 | 1) {
    setError(null)
    setOrderedIds((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) {
        return prev
      }
      const tmp = next[index]!
      next[index] = next[target]!
      next[target] = tmp
      return next
    })
  }

  function removePdf(id: string) {
    setError(null)
    setPdfs((prev) => prev.filter((p) => p.id !== id))
    setOrderedIds((prev) => prev.filter((x) => x !== id))
  }

  async function onPickFiles(fileList: FileList | null) {
    setError(null)
    try {
      const { pdfs: loaded, error: loadError } =
        await loadPdfsFromInput(fileList)
      if (loadError !== null) {
        setError(loadError)
        return
      }
      setPdfs((prev) => {
        const next = [...prev, ...loaded]
        return next.slice(0, MAX_MERGE_INPUTS)
      })
      setOrderedIds((prev) => {
        const room = MAX_MERGE_INPUTS - prev.length
        if (room <= 0) return prev
        return [...prev, ...loaded.map((p) => p.id).slice(0, room)]
      })
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte läsa PDF-filerna",
      )
    }
  }

  async function handleUseExisting() {
    if (existingMerge === null || existingMerge === undefined) {
      return
    }
    if (existingMerge.url === null) {
      setError("Den sparade filen saknas. Slå ihop igen.")
      return
    }
    setBusy("download")
    setError(null)
    try {
      const response = await fetch(existingMerge.url)
      if (!response.ok) {
        throw new Error("Kunde inte hämta den sparade PDF:en")
      }
      const blob = await response.blob()
      downloadBlob(blob, pdfFileName(nameBase, "sammanslagen"))
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte ladda ner den sparade PDF:en",
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleMergeFresh() {
    if (!canStart) return
    setBusy("merge")
    setError(null)
    try {
      const buffers = selectedPdfs.map((p) => p.bytes.slice(0))
      const mergedBytes = await mergePdfBlobs(buffers)
      const filename = pdfFileName(nameBase, "sammanslagen")
      const file = new File([new Uint8Array(mergedBytes)], filename, {
        type: "application/pdf",
      })
      downloadBlob(file, filename)

      const storageId = await uploadFileToStorage(file, () =>
        generateUploadUrl({}),
      )
      await registerMerge({
        inputHashes,
        mergedStorageId: storageId,
      })
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte slå ihop PDF:erna",
      )
    } finally {
      setBusy(null)
    }
  }

  const hasExisting =
    existingMerge !== null && existingMerge !== undefined

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Välj minst {MIN_MERGE_INPUTS} PDF:er och ordningen de ska slås ihop i.
        Resultatet laddas ner och sparas så andra kan få samma förslag i rum.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="merge-pdf-upload">Ladda upp PDF:er</Label>
        <Input
          id="merge-pdf-upload"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={busy !== null || pdfs.length >= MAX_MERGE_INPUTS}
          onChange={(event) => {
            void onPickFiles(event.target.files)
            event.target.value = ""
          }}
        />
      </div>

      {pdfs.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Uppladdade PDF:er</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {pdfs.map((pdf) => {
              const selected = orderedIds.includes(pdf.id)
              const atCap =
                !selected && orderedIds.length >= MAX_MERGE_INPUTS
              return (
                <li key={pdf.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={busy !== null || atCap}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      selected
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted/60",
                      (busy !== null || atCap) && "opacity-50",
                    )}
                    onClick={() => {
                      togglePdf(pdf.id)
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
                      {selected
                        ? String(orderedIds.indexOf(pdf.id) + 1)
                        : ""}
                    </span>
                    <span className="min-w-0 truncate">{pdf.name}</span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-8 shrink-0 px-0"
                    disabled={busy !== null}
                    title="Ta bort"
                    onClick={() => {
                      removePdf(pdf.id)
                    }}
                  >
                    <X className="size-3.5" />
                    <span className="sr-only">Ta bort</span>
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {selectedPdfs.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Ordning</p>
          <ol className="space-y-1">
            {selectedPdfs.map((pdf, index) => (
              <li
                key={pdf.id}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
              >
                <span className="w-5 shrink-0 text-muted-foreground">
                  {index + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate">{pdf.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 px-0"
                  disabled={busy !== null || index === 0}
                  onClick={() => {
                    moveSelected(index, -1)
                  }}
                >
                  <ArrowUp className="size-3.5" />
                  <span className="sr-only">Flytta upp</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 px-0"
                  disabled={
                    busy !== null || index === selectedPdfs.length - 1
                  }
                  onClick={() => {
                    moveSelected(index, 1)
                  }}
                >
                  <ArrowDown className="size-3.5" />
                  <span className="sr-only">Flytta ner</span>
                </Button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="merge-pdf-name">Filnamn</Label>
        <div className="flex items-center gap-1.5">
          <Input
            id="merge-pdf-name"
            value={nameBase}
            maxLength={Math.max(1, MAX_FILE_NAME_LENGTH - 4)}
            disabled={busy !== null}
            onChange={(event) => {
              setNameBase(event.target.value.replace(/\.pdf$/i, ""))
            }}
          />
          <span className="shrink-0 text-sm text-muted-foreground">.pdf</span>
        </div>
      </div>

      {hasExisting ? (
        <p className="text-sm text-muted-foreground">
          Samma PDF:er har slagits ihop tidigare. Du kan ladda ner den sparade
          filen.
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {hasExisting ? (
          <>
            <Button
              variant="outline"
              disabled={!canStart}
              onClick={() => {
                void handleMergeFresh()
              }}
            >
              {busy === "merge" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Slår ihop…
                </>
              ) : (
                "Slå ihop igen"
              )}
            </Button>
            <Button
              disabled={busy !== null}
              onClick={() => {
                void handleUseExisting()
              }}
            >
              {busy === "download" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Laddar ner…
                </>
              ) : (
                "Ladda ner befintlig"
              )}
            </Button>
          </>
        ) : (
          <Button
            disabled={!canStart}
            onClick={() => {
              void handleMergeFresh()
            }}
          >
            {busy === "merge" ? (
              <>
                <Loader2 className="animate-spin" />
                Slår ihop…
              </>
            ) : (
              <>
                <Combine />
                Slå ihop och ladda ner
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

function ExtractPanel() {
  const [pdfs, setPdfs] = useState<LocalPdf[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [ranges, setRanges] = useState<RangeDraft[]>([newRangeDraft()])
  const [nameBase, setNameBase] = useState("utdrag")
  const [pageCount, setPageCount] = useState<number | null>(null)
  const [loadingCount, setLoadingCount] = useState(false)
  const [busy, setBusy] = useState<"download" | "extract" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generateUploadUrl = useMutation(api.pdfTools.generateUploadUrl)
  const registerExtract = useMutation(api.pdfExtracts.register)

  const selectedPdf = useMemo(
    () => pdfs.find((p) => p.id === selectedId) ?? null,
    [pdfs, selectedId],
  )

  const parsedRanges = useMemo(() => parseRanges(ranges), [ranges])

  const validationError = useMemo(() => {
    if (parsedRanges === null) {
      const anyPartial = ranges.some((r) => {
        const s = r.start.trim()
        const e = r.end.trim()
        return (
          (s === "") !== (e === "") ||
          (s !== "" &&
            e !== "" &&
            (!Number.isInteger(Number(s)) || !Number.isInteger(Number(e))))
        )
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
    selectedPdf !== null &&
      parsedRanges !== null &&
      validationError === null
      ? {
          sourceContentHash: selectedPdf.contentHash,
          pageRanges: parsedRanges,
        }
      : "skip",
  )

  useEffect(() => {
    if (selectedPdf === null) {
      setPageCount(null)
      return
    }

    let cancelled = false
    setLoadingCount(true)
    setError(null)

    void (async () => {
      try {
        const count = await getPdfPageCount(selectedPdf.bytes.slice(0))
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
  }, [selectedPdf])

  function selectPdf(id: string) {
    setError(null)
    setSelectedId(id)
    const pdf = pdfs.find((p) => p.id === id)
    if (pdf !== undefined) {
      setNameBase(defaultExtractNameBase(pdf.name))
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

  function removePdf(id: string) {
    setError(null)
    setPdfs((prev) => prev.filter((p) => p.id !== id))
    if (selectedId === id) {
      setSelectedId(null)
      setPageCount(null)
      setNameBase("utdrag")
    }
  }

  async function onPickFiles(fileList: FileList | null) {
    setError(null)
    try {
      const { pdfs: loaded, error: loadError } =
        await loadPdfsFromInput(fileList)
      if (loadError !== null) {
        setError(loadError)
        return
      }
      setPdfs((prev) => [...prev, ...loaded])
      if (selectedId === null && loaded[0] !== undefined) {
        setSelectedId(loaded[0].id)
        setNameBase(defaultExtractNameBase(loaded[0].name))
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte läsa PDF-filerna",
      )
    }
  }

  const canStart =
    selectedPdf !== null &&
    parsedRanges !== null &&
    validationError === null &&
    pageCount !== null &&
    !loadingCount &&
    busy === null

  async function handleUseExisting() {
    if (existingExtract === null || existingExtract === undefined) {
      return
    }
    if (existingExtract.url === null) {
      setError("Den sparade filen saknas. Extrahera igen.")
      return
    }
    setBusy("download")
    setError(null)
    try {
      const response = await fetch(existingExtract.url)
      if (!response.ok) {
        throw new Error("Kunde inte hämta den sparade PDF:en")
      }
      const blob = await response.blob()
      downloadBlob(blob, pdfFileName(nameBase, "utdrag"))
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte ladda ner den sparade PDF:en",
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
      const extractedBytes = await extractPdfPages(
        selectedPdf.bytes.slice(0),
        parsedRanges,
      )
      const filename = pdfFileName(nameBase, "utdrag")
      const file = new File([new Uint8Array(extractedBytes)], filename, {
        type: "application/pdf",
      })
      downloadBlob(file, filename)

      const storageId = await uploadFileToStorage(file, () =>
        generateUploadUrl({}),
      )
      await registerExtract({
        sourceContentHash: selectedPdf.contentHash,
        pageRanges: parsedRanges,
        extractedStorageId: storageId,
      })
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
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Välj en PDF och ett eller flera sidintervall (t.ex. 1–3 och 10–12).
        Intervallen får inte överlappa. Resultatet laddas ner och sparas så
        andra kan få samma förslag i rum.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="extract-pdf-upload">Ladda upp PDF</Label>
        <Input
          id="extract-pdf-upload"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={busy !== null}
          onChange={(event) => {
            void onPickFiles(event.target.files)
            event.target.value = ""
          }}
        />
      </div>

      {pdfs.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Uppladdade PDF:er</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {pdfs.map((pdf) => {
              const selected = selectedId === pdf.id
              return (
                <li key={pdf.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={busy !== null}
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                      selected
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted/60",
                      busy !== null && "opacity-50",
                    )}
                    onClick={() => {
                      selectPdf(pdf.id)
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-8 shrink-0 px-0"
                    disabled={busy !== null}
                    title="Ta bort"
                    onClick={() => {
                      removePdf(pdf.id)
                    }}
                  >
                    <X className="size-3.5" />
                    <span className="sr-only">Ta bort</span>
                  </Button>
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
      ) : null}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Sidintervall</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null || ranges.length >= MAX_EXTRACT_RANGES}
            onClick={addRange}
          >
            <Plus className="size-3.5" />
            Lägg till
          </Button>
        </div>
        <ul className="space-y-2">
          {ranges.map((range) => (
            <li key={range.key} className="flex items-center gap-2">
              <Label className="sr-only" htmlFor={`tool-start-${range.key}`}>
                Från
              </Label>
              <Input
                id={`tool-start-${range.key}`}
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
              <Label className="sr-only" htmlFor={`tool-end-${range.key}`}>
                Till
              </Label>
              <Input
                id={`tool-end-${range.key}`}
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
        <Label htmlFor="tool-extract-pdf-name">Filnamn</Label>
        <div className="flex items-center gap-1.5">
          <Input
            id="tool-extract-pdf-name"
            value={nameBase}
            maxLength={Math.max(1, MAX_FILE_NAME_LENGTH - 4)}
            disabled={busy !== null}
            onChange={(event) => {
              setNameBase(event.target.value.replace(/\.pdf$/i, ""))
            }}
          />
          <span className="shrink-0 text-sm text-muted-foreground">.pdf</span>
        </div>
      </div>

      {hasExisting ? (
        <p className="text-sm text-muted-foreground">
          Samma sidintervall har extraherats tidigare från denna PDF. Du kan
          ladda ner den sparade filen.
        </p>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
              onClick={() => {
                void handleUseExisting()
              }}
            >
              {busy === "download" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Laddar ner…
                </>
              ) : (
                "Ladda ner befintlig"
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
              <>
                <Scissors />
                Extrahera och ladda ner
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

export function PdfToolsPage() {
  const [tab, setTab] = useState<"merge" | "extract">("merge")

  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-8">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          <Link
            to="/dashboard"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Tillbaka
          </Link>
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">PDF-verktyg</h1>
        <p className="text-muted-foreground">
          Slå ihop PDF:er eller extrahera sidor — ladda ner resultatet direkt.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="size-5" />
            {tab === "merge" ? "Slå ihop PDF:er" : "Extrahera sidor"}
          </CardTitle>
          <CardDescription>
            {tab === "merge"
              ? "Kombinera flera PDF:er till en fil"
              : "Plocka ut sidintervall till en ny PDF"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as "merge" | "extract")}
          >
            <TabsList
              className="mb-6 grid h-auto! w-full grid-cols-2"
              aria-label="PDF-verktyg"
            >
              <TabsTrigger value="merge" className="gap-1.5">
                <Combine className="size-3.5" />
                Slå ihop
              </TabsTrigger>
              <TabsTrigger value="extract" className="gap-1.5">
                <Scissors className="size-3.5" />
                Extrahera
              </TabsTrigger>
            </TabsList>
            <TabsContent value="merge">
              <MergePanel />
            </TabsContent>
            <TabsContent value="extract">
              <ExtractPanel />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  )
}
