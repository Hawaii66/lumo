import { Lightbulb, ScanSearch } from "lucide-react"
import { useState } from "react"
import type { Id } from "../../../convex/_generated/dataModel"
import { formatProblemMention } from "~/lib/chat-composer"
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
  subproblemLetter?: string
}

type ProblemHelpActionsProps = {
  roomId: Id<"rooms">
  problemNumber: string
  fileName: string
  /** Deluppgift letters from the problem markdown, e.g. ["a","b"]. */
  subproblemLetters?: Array<string>
  onSelect: (draft: ProblemHelpStartDraft) => void | Promise<void>
  pending?: boolean
  className?: string
}

export function ProblemHelpActions({
  roomId,
  problemNumber,
  fileName,
  subproblemLetters = [],
  onSelect,
  pending = false,
  className,
}: ProblemHelpActionsProps) {
  const [qrOpen, setQrOpen] = useState(false)
  const [localPending, setLocalPending] = useState<
    "genomgang" | "scan" | `genomgang-${string}` | null
  >(null)

  const letters = subproblemLetters
    .map((letter) => letter.trim().toLowerCase())
    .filter((letter) => /^[a-z]$/.test(letter))

  async function start(
    draft: ProblemHelpStartDraft,
    pendingKey: "genomgang" | "scan" | `genomgang-${string}`,
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

  function startGenomgang(letter: string | null) {
    void start(
      {
        mode: "genomgang",
        prompt: buildModeStartPrompt(
          "genomgang",
          problemNumber,
          fileName,
          letter,
        ),
        subproblemLetter: letter ?? undefined,
      },
      letter !== null ? `genomgang-${letter}` : "genomgang",
    )
  }

  function handlePhotoUploaded(file: PhoneUploadCompletedFile) {
    const mention =
      problemNumber.trim() && fileName.trim()
        ? formatProblemMention(problemNumber, fileName)
        : ""
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
      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2 sm:items-stretch">
        {/* Left column: big Genomgång (+ subproblem row when present) */}
        <div
          className={cn(
            letters.length > 0 && "grid grid-rows-[1fr_auto] gap-2",
            letters.length === 0 && "flex h-full flex-col",
          )}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => startGenomgang(null)}
            className={cn(
              "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-background px-5 py-6 text-primary transition-colors",
              "hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40",
              "disabled:pointer-events-none disabled:opacity-50",
              letters.length === 0 && "h-full",
            )}
          >
            <Lightbulb className="size-8 stroke-[1.75]" />
            <span className="text-lg font-semibold tracking-tight">
              {localPending === "genomgang" ? "Startar…" : "Genomgång"}
            </span>
            <span className="text-sm text-primary/80">
              Gå igenom uppgiften steg för steg
            </span>
          </button>

          {letters.length > 0 ? (
            <div
              role="group"
              aria-label="Genomgång per deluppgift"
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${letters.length}, minmax(0, 1fr))`,
              }}
            >
              {letters.map((letter) => {
                const pendingKey = `genomgang-${letter}` as const
                const letterPending = localPending === pendingKey
                return (
                  <button
                    key={letter}
                    type="button"
                    disabled={busy}
                    title={`Genomgång av deluppgift (${letter})`}
                    aria-label={`Genomgång av deluppgift ${letter}`}
                    onClick={() => {
                      if (busy) return
                      startGenomgang(letter)
                    }}
                    className={cn(
                      "flex min-h-10 items-center justify-center rounded-xl border-2 border-primary bg-background px-2 py-2 text-sm font-semibold tabular-nums text-primary transition-colors",
                      "hover:bg-primary/10",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      "disabled:pointer-events-none disabled:opacity-50",
                      letterPending && "bg-primary/10",
                    )}
                  >
                    {letterPending ? "…" : `(${letter})`}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        {/* Right column: Scan */}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (busy) return
            setQrOpen(true)
          }}
          className={cn(
            "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-primary bg-background px-5 py-6 text-primary transition-colors",
            "hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/40",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <ScanSearch className="size-8 stroke-[1.75]" />
          <span className="text-lg font-semibold tracking-tight">
            {localPending === "scan" ? "Startar…" : "Skanna mitt arbete"}
          </span>
          <span className="text-sm text-primary/80">
            Ladda upp från telefon
          </span>
        </button>
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
