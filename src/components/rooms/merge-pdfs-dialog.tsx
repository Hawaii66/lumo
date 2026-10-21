import { useAction, useMutation, useQuery } from "convex/react"
import {
  ArrowDown,
  ArrowUp,
  Combine,
  Loader2,
} from "lucide-react"
import { useMemo, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { MAX_FILE_NAME_LENGTH } from "../../../convex/lib/roomFiles"
import {
  MAX_MERGE_INPUTS,
  MIN_MERGE_INPUTS,
} from "../../../convex/lib/pdfMerge"
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
import { mergePdfBlobs } from "~/lib/mergePdfs"
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

type RoomPdf = {
  _id: Id<"files">
  name: string
  contentHash: string
  url: string | null
}

type MergePdfsDialogProps = {
  roomId: Id<"rooms">
  pdfs: RoomPdf[]
}

export function MergePdfsDialog({ roomId, pdfs }: MergePdfsDialogProps) {
  const [open, setOpen] = useState(false)
  const [orderedIds, setOrderedIds] = useState<Id<"files">[]>([])
  const [nameBase, setNameBase] = useState("sammanslagen")
  const [busy, setBusy] = useState<"attach" | "merge" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const saveFile = useMutation(api.files.save)
  const registerMerge = useMutation(api.pdfMerges.register)
  const attachToRoom = useAction(api.pdfMerges.attachToRoom)

  const selectedPdfs = useMemo(() => {
    const byId = new Map(pdfs.map((p) => [p._id, p] as const))
    return orderedIds
      .map((id) => byId.get(id))
      .filter((p): p is RoomPdf => p !== undefined)
  }, [orderedIds, pdfs])

  const inputHashes = selectedPdfs.map((p) => p.contentHash)

  const existingMerge = useQuery(
    api.pdfMerges.findByInputHashes,
    open && inputHashes.length >= MIN_MERGE_INPUTS
      ? { roomId, inputHashes }
      : "skip",
  )

  const canStart =
    selectedPdfs.length >= MIN_MERGE_INPUTS &&
    selectedPdfs.length <= MAX_MERGE_INPUTS &&
    selectedPdfs.every((p) => p.url !== null) &&
    busy === null

  function resetState() {
    setOrderedIds([])
    setNameBase("sammanslagen")
    setError(null)
    setBusy(null)
  }

  function togglePdf(fileId: Id<"files">) {
    setError(null)
    setOrderedIds((prev) => {
      if (prev.includes(fileId)) {
        return prev.filter((id) => id !== fileId)
      }
      if (prev.length >= MAX_MERGE_INPUTS) {
        return prev
      }
      return [...prev, fileId]
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

  function mergedFileName(): string {
    const base = nameBase.trim() || "sammanslagen"
    return `${base}.pdf`
  }

  async function handleUseExisting() {
    if (existingMerge === null || existingMerge === undefined) {
      return
    }
    setBusy("attach")
    setError(null)
    try {
      await attachToRoom({
        roomId,
        mergeId: existingMerge._id,
        name: mergedFileName(),
      })
      setOpen(false)
      resetState()
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte lägga till den sammanslagna filen",
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
      const buffers: ArrayBuffer[] = []
      for (const pdf of selectedPdfs) {
        if (pdf.url === null) {
          throw new Error(`PDF:en “${pdf.name}” är otillgänglig`)
        }
        const response = await fetch(pdf.url)
        if (!response.ok) {
          throw new Error(`Kunde inte hämta “${pdf.name}”`)
        }
        buffers.push(await response.arrayBuffer())
      }

      const mergedBytes = await mergePdfBlobs(buffers)
      const file = new File([new Uint8Array(mergedBytes)], mergedFileName(), {
        type: "application/pdf",
      })

      const storageId = await uploadFileToStorage(file, () =>
        generateUploadUrl({ roomId }),
      )
      await saveFile({ roomId, name: file.name, storageId })
      await registerMerge({
        roomId,
        inputHashes,
        mergedStorageId: storageId,
      })

      setOpen(false)
      resetState()
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
          <Button
            variant="outline"
            disabled={pdfs.length < MIN_MERGE_INPUTS}
          />
        }
      >
        <Combine />
        Slå ihop PDF:er
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Slå ihop PDF:er</DialogTitle>
          <DialogDescription>
            Välj minst {MIN_MERGE_INPUTS} PDF:er och ordningen de ska slås ihop
            i. Inget läggs till mellan filerna.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">PDF:er i rummet</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
              {pdfs.map((pdf) => {
                const selected = orderedIds.includes(pdf._id)
                const atCap =
                  !selected && orderedIds.length >= MAX_MERGE_INPUTS
                return (
                  <li key={pdf._id}>
                    <button
                      type="button"
                      disabled={busy !== null || atCap || pdf.url === null}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        selected
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted/60",
                        (busy !== null || atCap || pdf.url === null) &&
                          "opacity-50",
                      )}
                      onClick={() => {
                        togglePdf(pdf._id)
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
                          ? String(orderedIds.indexOf(pdf._id) + 1)
                          : ""}
                      </span>
                      <span className="min-w-0 truncate">{pdf.name}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {selectedPdfs.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Ordning</p>
              <ul className="space-y-1 rounded-md border border-border p-2">
                {selectedPdfs.map((pdf, index) => (
                  <li
                    key={pdf._id}
                    className="flex items-center gap-2 rounded-md px-1 py-1 text-sm"
                  >
                    <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    <span className="min-w-0 flex-1 truncate">{pdf.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-7 shrink-0 px-0"
                      disabled={busy !== null || index === 0}
                      title="Flytta upp"
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
                      className="size-7 shrink-0 px-0"
                      disabled={
                        busy !== null || index === selectedPdfs.length - 1
                      }
                      title="Flytta ner"
                      onClick={() => {
                        moveSelected(index, 1)
                      }}
                    >
                      <ArrowDown className="size-3.5" />
                      <span className="sr-only">Flytta ner</span>
                    </Button>
                  </li>
                ))}
              </ul>
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
              <span className="shrink-0 text-sm text-muted-foreground">
                .pdf
              </span>
            </div>
          </div>

          {hasExisting ? (
            <p className="text-sm text-muted-foreground">
              Dessa PDF:er har slagits ihop tidigare i samma ordning. Du kan
              återanvända den filen.
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
                void handleMergeFresh()
              }}
            >
              {busy === "merge" ? (
                <>
                  <Loader2 className="animate-spin" />
                  Slår ihop…
                </>
              ) : (
                "Slå ihop"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
