import { Archive, ChevronDown } from "lucide-react"
import { useEffect, useState } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  CHAT_DELETION_EXPIRIES,
  deletionExpiryTriggerLabel,
  type ChatDeletionExpiry,
} from "~/lib/chat-deletion-expiry"
import { cn } from "~/lib/utils"

type ChatDeletionExpiryPickerProps = {
  value: ChatDeletionExpiry
  deleteAt?: number | null
  onChange: (expiry: ChatDeletionExpiry) => void
  /** Confirm “archive now”. */
  onArchiveNow?: () => void | Promise<void>
  disabled?: boolean
  className?: string
}

export function ChatDeletionExpiryPicker({
  value,
  deleteAt = null,
  onChange,
  onArchiveNow,
  disabled = false,
  className,
}: ChatDeletionExpiryPickerProps) {
  const [now, setNow] = useState(() => Date.now())
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archivePending, setArchivePending] = useState(false)

  useEffect(() => {
    if (deleteAt == null) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [deleteAt])

  const triggerLabel = deletionExpiryTriggerLabel(value, deleteAt, now)

  async function confirmArchiveNow() {
    if (archivePending) return
    setArchivePending(true)
    try {
      await onArchiveNow?.()
      setArchiveOpen(false)
    } finally {
      setArchivePending(false)
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1.5",
        className,
      )}
      role="group"
      aria-label="När chatten arkiveras"
    >
      <span className="text-xs font-medium text-muted-foreground">
        Arkiveras
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs font-medium tabular-nums"
              aria-label="När chatten ska arkiveras"
            />
          }
        >
          {triggerLabel}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {CHAT_DELETION_EXPIRIES.map((option) => (
            <DropdownMenuItem
              key={option.value}
              title={option.description}
              className={cn(
                "text-xs font-medium",
                option.value === value && "bg-muted/70",
              )}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={disabled || archivePending}
        aria-label="Arkivera chatten nu"
        title="Arkivera nu"
        onClick={() => setArchiveOpen(true)}
      >
        <Archive className="size-3.5" />
      </Button>

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Arkivera chatten?</DialogTitle>
            <DialogDescription>
              Chatten flyttas till arkivet under Inställningar. Du kan återställa
              den senare.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Avbryt
            </DialogClose>
            <Button
              disabled={archivePending}
              onClick={() => {
                void confirmArchiveNow()
              }}
            >
              {archivePending ? "Arkiverar…" : "Arkivera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
