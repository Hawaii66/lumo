import { ScanSearch, Sigma } from "lucide-react"
import { ChatFilePickerTrigger } from "~/components/rooms/chat-file-picker-dialog"
import { Button } from "~/components/ui/button"

type ChatInputComposerActionsProps = {
  pending?: boolean
  imagesFull: boolean
  mathFull: boolean
  canSend: boolean
  onOpenFilePicker: () => void
  onOpenPhoneScan: () => void
  onOpenMath: () => void
}

export function ChatInputComposerActions({
  pending = false,
  imagesFull,
  mathFull,
  canSend,
  onOpenFilePicker,
  onOpenPhoneScan,
  onOpenMath,
}: ChatInputComposerActionsProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1.5">
        <ChatFilePickerTrigger
          disabled={pending || imagesFull}
          onClick={onOpenFilePicker}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || imagesFull}
          onClick={onOpenPhoneScan}
        >
          <ScanSearch />
          Skanna
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || mathFull}
          onClick={onOpenMath}
        >
          <Sigma />
          Formel
        </Button>
      </div>
      <Button type="submit" disabled={!canSend}>
        {pending ? "Skickar…" : "Skicka"}
      </Button>
    </div>
  )
}
