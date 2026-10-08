import { useMutation, useQuery } from "convex/react"
import { MessageSquarePlus } from "lucide-react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { cn } from "~/lib/utils"

const MAX_TITLE_LENGTH = 80

type ThreadsPanelProps = {
  roomId: Id<"rooms">
  selectedThreadId: string | null
  onSelectThread: (threadId: string) => void
}

function CreateThreadDialog({
  roomId,
  onCreated,
}: {
  roomId: Id<"rooms">
  onCreated: (threadId: string) => void
}) {
  const createThread = useMutation(api.threads.create)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function resetForm() {
    setTitle("")
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) resetForm()
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-1.5"
          />
        }
      >
        <MessageSquarePlus />
        Ny tråd
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            setPending(true)
            void createThread({
              roomId,
              title: title.trim() || undefined,
            })
              .then((result) => {
                setOpen(false)
                resetForm()
                onCreated(result.threadId)
              })
              .catch((err: unknown) => {
                setError(
                  err instanceof Error ? err.message : "Kunde inte skapa tråd",
                )
              })
              .finally(() => setPending(false))
          }}
        >
          <DialogHeader>
            <DialogTitle>Ny tråd</DialogTitle>
            <DialogDescription>
              Skapa en konversation i rummet. Du kan lämna titeln tom.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="thread-title">Titel</Label>
            <Input
              id="thread-title"
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ny tråd"
              autoFocus
            />
            <p className="text-right text-xs text-muted-foreground">
              {title.length}/{MAX_TITLE_LENGTH}
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Skapar…" : "Skapa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ThreadsPanel({
  roomId,
  selectedThreadId,
  onSelectThread,
}: ThreadsPanelProps) {
  const threads = useQuery(api.threads.listByRoom, { roomId })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-sidebar-border p-2">
        <CreateThreadDialog roomId={roomId} onCreated={onSelectThread} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {threads === undefined ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">
            Hämtar trådar…
          </p>
        ) : threads.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">
            Inga trådar ännu.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5" aria-label="Trådar">
            {threads.map((thread) => {
              const selected = thread.threadId === selectedThreadId
              return (
                <li key={thread._id}>
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.threadId)}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "font-medium hover:bg-sidebar-accent/60",
                    )}
                  >
                    <span className="line-clamp-2">{thread.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
