import { useQuery } from "convex/react"
import { File as FileIcon, Paperclip, Smartphone, Upload } from "lucide-react"
import { useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { isImageFile } from "~/components/rooms/image-viewer-sheet"
import {
  PhoneUploadDialog,
  type PhoneUploadCompletedFile,
} from "~/components/rooms/phone-upload-dialog"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { cn } from "~/lib/utils"

export type ChatFilePickerSelectedFile = {
  storageId: Id<"_storage">
  filename: string
}

type ChatFilePickerDialogProps = {
  roomId: Id<"rooms">
  open: boolean
  onOpenChange: (open: boolean) => void
  disabled?: boolean
  /** Local computer files (not yet in room storage). */
  onPickLocalFiles: (files: FileList | null) => void
  /** Already-uploaded room file or phone upload. */
  onPickStorageFile: (file: ChatFilePickerSelectedFile) => void
  /** Storage IDs already attached in the composer. */
  excludeStorageIds?: ReadonlySet<Id<"_storage">>
}

export function ChatFilePickerDialog({
  roomId,
  open,
  onOpenChange,
  disabled = false,
  onPickLocalFiles,
  onPickStorageFile,
  excludeStorageIds,
}: ChatFilePickerDialogProps) {
  const files = useQuery(api.files.listByRoom, open ? { roomId } : "skip")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [phoneUploadOpen, setPhoneUploadOpen] = useState(false)

  const imageFiles =
    files?.filter(
      (file) =>
        isImageFile(file.name) &&
        !(excludeStorageIds?.has(file.storageId) ?? false),
    ) ?? []

  function handleLocalPick(fileList: FileList | null) {
    onPickLocalFiles(fileList)
    onOpenChange(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  function handleSelectExisting(file: {
    storageId: Id<"_storage">
    name: string
  }) {
    onPickStorageFile({
      storageId: file.storageId,
      filename: file.name,
    })
    onOpenChange(false)
  }

  function handlePhoneCompleted(file: PhoneUploadCompletedFile) {
    onPickStorageFile({
      storageId: file.storageId,
      filename: file.filename,
    })
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(90vh,40rem)] w-[50vw] max-w-[50vw] flex-col gap-4 sm:max-w-[50vw]">
          <DialogHeader>
            <DialogTitle>Bifoga fil</DialogTitle>
            <DialogDescription>
              Ladda upp från dator eller telefon, eller välj en bild som redan
              finns i rummet.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-start gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={disabled}
              onChange={(event) => {
                handleLocalPick(event.target.files)
              }}
            />
            <Button
              type="button"
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload />
              Från dator
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => setPhoneUploadOpen(true)}
            >
              <Smartphone />
              Från telefon
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {files === undefined ? (
              <p className="text-sm text-muted-foreground">Hämtar filer…</p>
            ) : imageFiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Inga bilder i rummet ännu. Ladda upp från dator eller telefon.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-3">
                {imageFiles.map((file) => (
                  <li key={file._id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleSelectExisting(file)}
                      className={cn(
                        "flex w-full flex-col overflow-hidden rounded-lg border border-border text-left transition-colors",
                        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:pointer-events-none disabled:opacity-50",
                      )}
                    >
                      {file.url ? (
                        <span className="flex h-28 items-center justify-center overflow-hidden bg-muted/40">
                          <img
                            src={file.url}
                            alt={file.name}
                            className="h-full w-full object-contain"
                          />
                        </span>
                      ) : (
                        <span className="flex h-28 items-center justify-center bg-muted/40">
                          <FileIcon className="size-8 text-muted-foreground" />
                        </span>
                      )}
                      <span className="truncate px-2.5 py-2 text-xs font-medium">
                        {file.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PhoneUploadDialog
        roomId={roomId}
        open={phoneUploadOpen}
        onOpenChange={setPhoneUploadOpen}
        onCompleted={handlePhoneCompleted}
        showTrigger={false}
      />
    </>
  )
}

type ChatFilePickerTriggerProps = {
  disabled?: boolean
  onClick: () => void
}

export function ChatFilePickerTrigger({
  disabled,
  onClick,
}: ChatFilePickerTriggerProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      onClick={onClick}
    >
      <Paperclip />
      Fil
    </Button>
  )
}
