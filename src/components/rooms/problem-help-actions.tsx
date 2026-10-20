import { Lightbulb, ScanSearch } from "lucide-react"
import { useState } from "react"
import type { Id } from "../../../convex/_generated/dataModel"
import {
  buildModeStartPrompt,
  type ChatMode,
} from "~/lib/chat-mode"
import {
  PhoneUploadDialog,
  type PhoneUploadCompletedFile,
} from "~/components/rooms/phone-upload-dialog"
import { cn } from "~/lib/utils"

export type ProblemHelpStartDraft = {
  mode: ChatMode
  prompt: string
  images?: Array<{ storageId: Id<"_storage">; filename: string }>
}

type ProblemHelpActionsProps = {
  roomId: Id<"rooms">
  problemNumber: string
  onSelect: (draft: ProblemHelpStartDraft) => void | Promise<void>
  pending?: boolean
  className?: string
}

const ACTIONS: Array<{
  id: Exclude<ChatMode, "normal"> | "scan"
  label: string
  description: string
  icon: typeof Lightbulb
  needsPhoto: boolean
}> = [
  {
    id: "genomgang",
    label: "Genomgång",
    description: "Gå igenom uppgiften steg för steg",
    icon: Lightbulb,
    needsPhoto: false,
  },
  {
    id: "scan",
    label: "Skanna mitt arbete",
    description: "Ladda upp från telefon",
    icon: ScanSearch,
    needsPhoto: true,
  },
]

export function ProblemHelpActions({
  roomId,
  problemNumber,
  onSelect,
  pending = false,
  className,
}: ProblemHelpActionsProps) {
  const [qrOpen, setQrOpen] = useState(false)
  const [localPending, setLocalPending] = useState<
    Exclude<ChatMode, "normal"> | "scan" | null
  >(null)

  async function start(
    draft: ProblemHelpStartDraft,
    pendingKey: Exclude<ChatMode, "normal"> | "scan",
  ) {
    if (pending || localPending !== null) return
    setLocalPending(pendingKey)
    try {
      await onSelect(draft)
    } finally {
      setLocalPending(null)
    }
  }

  const busy = pending || localPending !== null

  function handleActionClick(action: (typeof ACTIONS)[number]) {
    if (busy) return
    if (action.id === "scan" || action.needsPhoto) {
      setQrOpen(true)
      return
    }
    void start(
      {
        mode: action.id,
        prompt: buildModeStartPrompt(action.id, problemNumber),
      },
      action.id,
    )
  }

  function handlePhotoUploaded(file: PhoneUploadCompletedFile) {
    const mention = problemNumber.trim() ? `@${problemNumber.trim()}` : ""
    void start(
      {
        mode: "normal",
        prompt: [mention, "Här är mitt arbete hittills — hjälp mig utifrån det."]
          .filter((part) => part.length > 0)
          .join(" "),
        images: [{ storageId: file.storageId, filename: file.filename }],
      },
      "scan",
    )
  }

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          const isThisPending = localPending === action.id
          return (
            <button
              key={action.id}
              type="button"
              disabled={busy}
              onClick={() => handleActionClick(action)}
              className={cn(
                "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-background px-5 py-6 text-primary transition-colors",
                "hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40",
                "disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              <Icon className="size-8 stroke-[1.75]" />
              <span className="text-lg font-semibold tracking-tight">
                {isThisPending ? "Startar…" : action.label}
              </span>
              <span className="text-sm text-primary/80">
                {action.description}
              </span>
            </button>
          )
        })}
      </div>

      <PhoneUploadDialog
        roomId={roomId}
        open={qrOpen}
        onOpenChange={setQrOpen}
        onCompleted={handlePhotoUploaded}
        showTrigger={false}
      />
    </div>
  )
}
