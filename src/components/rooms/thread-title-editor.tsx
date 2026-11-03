import { useMutation } from "convex/react"
import { Pencil } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"

const MAX_TITLE_LENGTH = 80

export function ThreadTitleEditor({
  roomId,
  threadId,
  title,
}: {
  roomId: Id<"rooms">
  threadId: string
  title: string
}) {
  const setTitle = useMutation(api.threads.setTitle)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) {
      setDraft(title)
      setError(null)
    }
  }, [editing, title])

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  function startEdit() {
    setDraft(title)
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft(title)
    setError(null)
  }

  async function commitEdit() {
    const next = draft.trim().slice(0, MAX_TITLE_LENGTH)
    if (next.length === 0) {
      setError("Titeln får inte vara tom")
      inputRef.current?.focus()
      return
    }
    if (next === title) {
      setEditing(false)
      setError(null)
      return
    }

    setSaving(true)
    setError(null)
    try {
      await setTitle({ roomId, threadId, title: next })
      setEditing(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Kunde inte byta titel")
      inputRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          className="min-w-0 truncate text-left text-lg font-medium hover:underline"
          title={`${title} — klicka för att byta titel`}
          onClick={startEdit}
        >
          {title}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="size-7 shrink-0 px-0"
          title="Byt titel"
          onClick={startEdit}
        >
          <Pencil className="size-3.5" />
          <span className="sr-only">Byt titel</span>
        </Button>
      </div>
    )
  }

  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          maxLength={MAX_TITLE_LENGTH}
          disabled={saving}
          aria-label="Chattitel"
          aria-invalid={error !== null}
          className="h-9 min-w-0 flex-1 text-lg font-medium"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void commitEdit()
            } else if (event.key === "Escape") {
              event.preventDefault()
              cancelEdit()
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={saving || draft.trim().length === 0}
          onClick={() => {
            void commitEdit()
          }}
        >
          {saving ? "Sparar…" : "Spara"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={cancelEdit}
        >
          Avbryt
        </Button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Enter sparar · Esc avbryter
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {draft.length}/{MAX_TITLE_LENGTH}
        </p>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
