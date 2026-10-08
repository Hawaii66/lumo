import { useMutation, useQuery } from "convex/react"
import {
  Download,
  Eye,
  File as FileIcon,
  FolderOpen,
  Upload,
} from "lucide-react"
import { useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { PhoneUploadDialog } from "~/components/rooms/phone-upload-dialog"
import { isPdfFile, PdfViewerSheet } from "~/components/rooms/pdf-viewer-sheet"
import { Button } from "~/components/ui/button"
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
        const uploadUrl = await generateUploadUrl({ roomId })
        const result = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        })
        if (!result.ok) {
          throw new Error(`Kunde inte ladda upp ${file.name}`)
        }
        const { storageId } = (await result.json()) as {
          storageId: Id<"_storage">
        }
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

type ViewingPdf = {
  name: string
  url: string | null
}

export function FilesGrid({ roomId }: FilesPanelProps) {
  const files = useQuery(api.files.listByRoom, { roomId })
  const [viewingPdf, setViewingPdf] = useState<ViewingPdf | null>(null)

  if (files === undefined) {
    return <p className="text-sm text-muted-foreground">Hämtar filer…</p>
  }

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
        </div>
      </div>

      {files.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {files.map((file) => {
            const pdf = isPdfFile(file.name)
            return (
              <li
                key={file._id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5"
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate" title={file.name}>
                    {file.name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {pdf ? (
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
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}

      <PdfViewerSheet
        open={viewingPdf !== null}
        onOpenChange={(open) => {
          if (!open) setViewingPdf(null)
        }}
        fileName={viewingPdf?.name ?? null}
        url={viewingPdf?.url ?? null}
      />
    </div>
  )
}
