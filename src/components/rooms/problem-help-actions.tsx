import { useMutation } from "convex/react"
import { CheckCircle2, Lightbulb, PenLine, ScanSearch } from "lucide-react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { HelpLevel } from "~/lib/schemas"
import {
  PhoneUploadDialog,
  type PhoneUploadCompletedFile,
} from "~/components/rooms/phone-upload-dialog"
import { cn } from "~/lib/utils"

type ProblemHelpActionsProps = {
  roomId: Id<"rooms">
  problemNumber: string
  onStarted: (threadId: string) => void
  className?: string
}

const ACTIONS: Array<{
  value: HelpLevel
  label: string
  description: string
  icon: typeof ScanSearch
  needsPhoto: boolean
}> = [
  {
    value: "minimal",
    label: "Skanna mitt arbete",
    description: "Ladda upp från telefon",
    icon: ScanSearch,
    needsPhoto: true,
  },
  {
    value: "explain",
    label: "Förklara tankegången",
    description: "Hur man tänker steg för steg",
    icon: Lightbulb,
    needsPhoto: false,
  },
  {
    value: "solve",
    label: "Visa hela lösningen",
    description: "Steg för steg med svar",
    icon: CheckCircle2,
    needsPhoto: false,
  },
]

export function ProblemHelpActions({
  roomId,
  problemNumber,
  onStarted,
  className,
}: ProblemHelpActionsProps) {
  const createThread = useMutation(api.threads.create)
  const sendMessage = useMutation(api.threads.sendMessage)

  const [pendingLevel, setPendingLevel] = useState<HelpLevel | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = pendingLevel !== null

  async function startChat(args: {
    helpLevel: HelpLevel
    prompt: string
    images?: Array<{ storageId: Id<"_storage">; filename: string }>
  }) {
    if (pending) return

    setError(null)
    setPendingLevel(args.helpLevel)
    try {
      const result = await createThread({
        roomId,
        title: `Uppgift ${problemNumber}`,
      })

      await sendMessage({
        roomId,
        threadId: result.threadId,
        prompt: args.prompt,
        images: args.images,
        helpLevel: args.helpLevel,
      })

      onStarted(result.threadId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte starta chatt")
    } finally {
      setPendingLevel(null)
    }
  }

  function handleActionClick(action: (typeof ACTIONS)[number]) {
    if (pending) return

    if (action.needsPhoto) {
      setError(null)
      setQrOpen(true)
      return
    }

    void startChat({
      helpLevel: action.value,
      prompt: "Hjälp mig med den här uppgiften.",
    })
  }

  function handlePhotoUploaded(file: PhoneUploadCompletedFile) {
    void startChat({
      helpLevel: "minimal",
      prompt: "Här är mitt arbete hittills — hjälp mig utifrån det.",
      images: [{ storageId: file.storageId, filename: file.filename }],
    })
  }

  const practicePending = pendingLevel === "practice"

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="flex w-full max-w-3xl flex-col gap-3">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-center">
          {ACTIONS.map((action) => {
            const Icon = action.icon
            const isThisPending = pendingLevel === action.value
            return (
              <button
                key={action.value}
                type="button"
                disabled={pending}
                onClick={() => handleActionClick(action)}
                className={cn(
                  "flex min-h-28 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-background px-5 py-6 text-primary transition-colors",
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

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            void startChat({
              helpLevel: "practice",
              prompt:
                "Jag vill svara själv — ge mig svarsrutor för den här uppgiften.",
            })
          }
          className={cn(
            "flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-primary bg-background px-5 py-3 text-primary transition-colors",
            "hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <PenLine className="size-5 shrink-0 stroke-[1.75]" />
          <span className="text-base font-semibold tracking-tight">
            {practicePending ? "Startar…" : "Svara själv"}
          </span>
        </button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
