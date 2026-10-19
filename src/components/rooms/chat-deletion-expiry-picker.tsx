import { ChevronDown, Trash2 } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"
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
  CHAT_DELETION_EXPIRIES,
  deletionExpiryTriggerLabel,
  type ChatDeletionExpiry,
} from "~/lib/chat-deletion-expiry"
import { cn } from "~/lib/utils"

type ChatDeletionExpiryPickerProps = {
  value: ChatDeletionExpiry
  deleteAt?: number | null
  onChange: (expiry: ChatDeletionExpiry) => void
  /** Confirm “delete now” — deletion itself is wired later. */
  onDeleteNow?: () => void | Promise<void>
  disabled?: boolean
  className?: string
}

export function ChatDeletionExpiryPicker({
  value,
  deleteAt = null,
  onChange,
  onDeleteNow,
  disabled = false,
  className,
}: ChatDeletionExpiryPickerProps) {
  const [now, setNow] = useState(() => Date.now())
  const [menuOpen, setMenuOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (deleteAt == null) return
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [deleteAt])

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false)
    }

    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [menuOpen])

  const triggerLabel = deletionExpiryTriggerLabel(value, deleteAt, now)

  async function confirmDeleteNow() {
    if (deletePending) return
    setDeletePending(true)
    try {
      await onDeleteNow?.()
      setDeleteOpen(false)
    } finally {
      setDeletePending(false)
    }
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1.5",
        className,
      )}
      role="group"
      aria-label="När chatten raderas"
    >
      <span className="text-xs font-medium text-muted-foreground">Raderas</span>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-controls={listId}
          aria-label="När chatten ska raderas"
          onClick={() => setMenuOpen((prev) => !prev)}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground tabular-nums",
            "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          {triggerLabel}
          <ChevronDown className="size-3.5 opacity-60" aria-hidden />
        </button>

        {menuOpen ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Välj raderingstid"
            className="absolute right-0 z-20 mt-1 min-w-full overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
          >
            {CHAT_DELETION_EXPIRIES.map((option) => {
              const selected = option.value === value
              return (
                <li key={option.value} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    title={option.description}
                    className={cn(
                      "flex w-full whitespace-nowrap px-3 py-1.5 text-left text-xs font-medium",
                      "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                      selected && "bg-muted/70 text-foreground",
                    )}
                    onClick={() => {
                      onChange(option.value)
                      setMenuOpen(false)
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>

      <button
        type="button"
        disabled={disabled || deletePending}
        aria-label="Radera chatten nu"
        title="Radera nu"
        onClick={() => {
          setMenuOpen(false)
          setDeleteOpen(true)
        }}
        className={cn(
          "inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
          "hover:bg-destructive/10 hover:text-destructive",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <Trash2 className="size-3.5" />
      </button>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Radera chatten?</DialogTitle>
            <DialogDescription>
              Chatten och alla meddelanden tas bort direkt. Det går inte att
              ångra.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Avbryt
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deletePending}
              onClick={() => {
                void confirmDeleteNow()
              }}
            >
              {deletePending ? "Raderar…" : "Radera nu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
