import { X } from "lucide-react"
import type {
  ChatInputImage,
  ChatInputStorageImage,
} from "./types"

type ChatInputAttachmentsProps = {
  pendingImages: Array<ChatInputImage>
  pendingStorageImages: Array<ChatInputStorageImage>
  pending?: boolean
  onRemoveImage: (id: string) => void
  onRemoveStorageImage: (id: string) => void
}

export function ChatInputAttachments({
  pendingImages,
  pendingStorageImages,
  pending = false,
  onRemoveImage,
  onRemoveStorageImage,
}: ChatInputAttachmentsProps) {
  if (pendingImages.length === 0 && pendingStorageImages.length === 0) {
    return null
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {pendingImages.map((image) => (
        <li
          key={image.id}
          className="relative size-16 overflow-hidden rounded-md border border-border"
        >
          <img
            src={image.previewUrl}
            alt={image.file.name}
            className="size-full object-cover"
          />
          <button
            type="button"
            className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5 text-foreground shadow-sm"
            onClick={() => onRemoveImage(image.id)}
            aria-label={`Ta bort ${image.file.name}`}
            disabled={pending}
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
      {pendingStorageImages.map((image) => (
        <li
          key={image.id}
          className="relative flex size-16 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 px-1"
        >
          <span className="line-clamp-3 text-center text-[10px] leading-tight text-muted-foreground">
            {image.filename}
          </span>
          <button
            type="button"
            className="absolute top-0.5 right-0.5 rounded-full bg-background/90 p-0.5 text-foreground shadow-sm"
            onClick={() => onRemoveStorageImage(image.id)}
            aria-label={`Ta bort ${image.filename}`}
            disabled={pending}
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}
