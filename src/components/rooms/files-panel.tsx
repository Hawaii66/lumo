import { useAction, useMutation, useQuery } from "convex/react"
import { usePdfiumEngine } from "@embedpdf/engines/react"
import {
  Download,
  Eye,
  File as FileIcon,
  FolderOpen,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import {
  fileExtension,
  MAX_FILE_NAME_LENGTH,
  ROOM_FILE_ACCEPT,
  ROOM_FILE_TYPE_ERROR,
  isAllowedRoomFile,
} from "../../../convex/lib/roomFiles"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  ImageViewerSheet,
  isImageFile,
} from "~/components/rooms/image-viewer-sheet"
import { PdfPreview } from "~/components/rooms/pdf-preview"
import { MergePdfsDialog } from "~/components/rooms/merge-pdfs-dialog"
import { ParsePdfDialog } from "~/components/rooms/parse-pdf-dialog"
import { PhoneUploadDialog } from "~/components/rooms/phone-upload-dialog"
import { PdfViewerSheet, isPdfFile } from "~/components/rooms/pdf-viewer-sheet"
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
import { uploadFileToStorage } from "~/lib/upload"
import { cn } from "~/lib/utils"

type FilesPanelProps = {
  roomId: Id<"rooms">
}

export function RoomFilesTabBar({
  filesActive,
  onShowFiles,
}: {
  filesActive: boolean
  onShowFiles: () => void
}) {
  return (
    <div className="border-t border-sidebar-border p-2">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "w-full justify-start gap-1.5",
          filesActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        )}
        onClick={onShowFiles}
      >
        <FolderOpen />
        Filer
      </Button>
    </div>
  )
}

function UploadButton({ roomId }: { roomId: Id<"rooms"> }) {
  const generateUploadUrl = useMutation(api.files.generateUploadUrl)
  const saveFile = useMutation(api.files.save)
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return

    setError(null)
    setUploading(true)
    try {
      for (const file of Array.from(fileList)) {
        if (!isAllowedRoomFile(file.name, file.type)) {
          throw new Error(ROOM_FILE_TYPE_ERROR)
        }
        const storageId = await uploadFileToStorage(file, () =>
          generateUploadUrl({ roomId }),
        )
        await saveFile({ roomId, name: file.name, storageId })
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte ladda upp")
    } finally {
      setUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ""
      }
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        multiple
        accept={ROOM_FILE_ACCEPT}
        onChange={(event) => {
          void uploadFiles(event.target.files)
        }}
      />
      <Button
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload />
        {uploading ? "Laddar upp…" : "Från dator"}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

type ViewingFile = {
  name: string
  url: string | null
}

type PendingDelete = {
  id: Id<"files">
  name: string
}

function fileBaseName(name: string): string {
  const extension = fileExtension(name)
  if (extension.length === 0) return name
  return name.slice(0, -extension.length)
}

function FileNameEditor({
  fileId,
  name,
}: {
  fileId: Id<"files">
  name: string
}) {
  const renameFile = useMutation(api.files.rename)
  const extension = fileExtension(name)
  const baseName = fileBaseName(name)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(baseName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const skipBlurSave = useRef(false)

  useEffect(() => {
    if (!editing) {
      setDraft(baseName)
      setError(null)
    }
  }, [baseName, editing])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEdit() {
    setDraft(baseName)
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    skipBlurSave.current = true
    setEditing(false)
    setDraft(baseName)
    setError(null)
  }

  async function commitEdit() {
    const nextBase = draft.trim()
    const next = `${nextBase}${extension}`
    if (next === name) {
      setEditing(false)
      setError(null)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await renameFile({ fileId, name: next })
      setEditing(false)
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Kunde inte byta namn på filen",
      )
      inputRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <button
          type="button"
          className="min-w-0 truncate text-left text-sm font-medium hover:underline"
          title={`${name} — klicka för att byta namn`}
          onClick={startEdit}
        >
          {name}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 px-0"
          title="Byt namn"
          onClick={startEdit}
        >
          <Pencil className="size-3.5" />
          <span className="sr-only">Byt namn</span>
        </Button>
      </span>
    )
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          maxLength={Math.max(1, MAX_FILE_NAME_LENGTH - extension.length)}
          disabled={saving}
          aria-label="Filnamn"
          aria-invalid={error !== null}
          className="h-7 min-w-0 flex-1 text-sm"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void commitEdit()
            } else if (event.key === "Escape") {
              event.preventDefault()
              cancelEdit()
            }
          }}
          onBlur={() => {
            if (skipBlurSave.current) {
              skipBlurSave.current = false
              return
            }
            void commitEdit()
          }}
        />
        {extension ? (
          <span className="shrink-0 text-sm text-muted-foreground">
            {extension}
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  )
}

function MergeSuggestionsBanner({ roomId }: { roomId: Id<"rooms"> }) {
  const suggestions = useQuery(api.pdfMerges.listSuggestionsForRoom, {
    roomId,
  })
  const attachToRoom = useAction(api.pdfMerges.attachToRoom)
  const [attachingId, setAttachingId] = useState<Id<"pdfMerges"> | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (suggestions === undefined || suggestions.length === 0) {
    return null
  }

  async function handleAttach(
    mergeId: Id<"pdfMerges">,
    inputNames: string[],
  ) {
    setError(null)
    setAttachingId(mergeId)
    try {
      const base =
        inputNames.length > 0
          ? `sammanslagen-${inputNames.map((n) => n.replace(/\.pdf$/i, "")).join("-")}`.slice(
              0,
              Math.max(1, MAX_FILE_NAME_LENGTH - 4),
            )
          : "sammanslagen"
      await attachToRoom({
        roomId,
        mergeId,
        name: `${base}.pdf`,
      })
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Kunde inte lägga till den sammanslagna filen",
      )
    } finally {
      setAttachingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-sm font-medium">Tidigare sammanslagningar</p>
      <p className="text-sm text-muted-foreground">
        Dessa PDF:er har slagits ihop tidigare. Du kan lägga till den
        sammanslagna filen i rummet.
      </p>
      <ul className="flex flex-col gap-2">
        {suggestions.map((suggestion) => (
          <li
            key={suggestion._id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-sm">
              {suggestion.inputNames.join(" → ")}
            </span>
            <Button
              size="sm"
              disabled={attachingId !== null}
              onClick={() => {
                void handleAttach(suggestion._id, suggestion.inputNames)
              }}
            >
              {attachingId === suggestion._id ? "Lägger till…" : "Lägg till i rummet"}
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

export function FilesGrid({ roomId }: FilesPanelProps) {
  const files = useQuery(api.files.listByRoom, { roomId })
  const { engine, isLoading: engineLoading } = usePdfiumEngine()
  const removeFile = useMutation(api.files.remove)
  const [viewingPdf, setViewingPdf] = useState<ViewingFile | null>(null)
  const [viewingImage, setViewingImage] = useState<ViewingFile | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function confirmDelete() {
    if (pendingDelete === null) return

    setDeleteError(null)
    setDeleting(true)
    try {
      await removeFile({ fileId: pendingDelete.id })
      setPendingDelete(null)
    } catch (err: unknown) {
      setDeleteError(
        err instanceof Error ? err.message : "Kunde inte ta bort filen",
      )
    } finally {
      setDeleting(false)
    }
  }

  if (files === undefined) {
    return <p className="text-sm text-muted-foreground">Hämtar filer…</p>
  }

  const pdfFiles = files.filter((file) => isPdfFile(file.name))

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Filer</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {files.length === 0
              ? "Inga filer ännu."
              : `${files.length} ${files.length === 1 ? "fil" : "filer"} i rummet`}
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-2">
          <UploadButton roomId={roomId} />
          <PhoneUploadDialog roomId={roomId} />
          <MergePdfsDialog roomId={roomId} pdfs={pdfFiles} />
        </div>
      </div>

      <MergeSuggestionsBanner roomId={roomId} />

      {files.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => {
            const pdf = isPdfFile(file.name)
            const image = isImageFile(file.name)
            return (
              <li
                key={file._id}
                className="flex flex-col overflow-hidden rounded-lg border border-border"
              >
                {pdf && file.url ? (
                  <button
                    type="button"
                    className="flex h-44 items-center justify-center overflow-hidden bg-muted/40 transition-colors hover:bg-muted/70"
                    onClick={() =>
                      setViewingPdf({ name: file.name, url: file.url })
                    }
                  >
                    {engineLoading || !engine ? (
                      <span className="text-xs text-muted-foreground">
                        Laddar…
                      </span>
                    ) : (
                      <PdfPreview
                        url={file.url}
                        engine={engine}
                        className="pointer-events-none h-full w-full"
                      />
                    )}
                  </button>
                ) : image && file.url ? (
                  <button
                    type="button"
                    className="flex h-44 items-center justify-center overflow-hidden bg-muted/40 transition-colors hover:bg-muted/70"
                    onClick={() =>
                      setViewingImage({ name: file.name, url: file.url })
                    }
                  >
                    <img
                      src={file.url}
                      alt={file.name}
                      className="h-full w-full object-contain"
                    />
                  </button>
                ) : (
                  <div className="flex h-44 items-center justify-center bg-muted/40">
                    <FileIcon className="size-10 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col gap-2 px-3 py-2.5">
                  <FileNameEditor fileId={file._id} name={file.name} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    {pdf ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!file.url}
                          onClick={() =>
                            setViewingPdf({ name: file.name, url: file.url })
                          }
                        >
                          <Eye />
                          Visa
                        </Button>
                        <ParsePdfDialog
                          fileId={file._id}
                          fileName={file.name}
                        />
                      </>
                    ) : null}
                    {image ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!file.url}
                        onClick={() =>
                          setViewingImage({ name: file.name, url: file.url })
                        }
                      >
                        <Eye />
                        Visa
                      </Button>
                    ) : null}
                    {file.url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        render={
                          <a
                            href={file.url}
                            download={file.name}
                            target="_blank"
                            rel="noreferrer"
                          />
                        }
                      >
                        <Download />
                        Ladda ner
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        Otillgänglig
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setDeleteError(null)
                        setPendingDelete({ id: file._id, name: file.name })
                      }}
                    >
                      <Trash2 />
                      Ta bort
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setPendingDelete(null)
            setDeleteError(null)
          }
        }}
      >
        <DialogContent showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>Ta bort fil?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `Är du säker på att du vill ta bort “${pendingDelete.name}”? Det går inte att ångra.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={deleting} />}
            >
              Avbryt
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                void confirmDelete()
              }}
            >
              {deleting ? "Tar bort…" : "Ta bort"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdfViewerSheet
        open={viewingPdf !== null}
        onOpenChange={(open) => {
          if (!open) setViewingPdf(null)
        }}
        fileName={viewingPdf?.name ?? null}
        url={viewingPdf?.url ?? null}
      />

      <ImageViewerSheet
        open={viewingImage !== null}
        onOpenChange={(open) => {
          if (!open) setViewingImage(null)
        }}
        fileName={viewingImage?.name ?? null}
        url={viewingImage?.url ?? null}
      />
    </div>
  )
}
