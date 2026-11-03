import { X } from "lucide-react"
import { StaticMath } from "~/components/lumo/static-math"
import { formatMathRef, type MathRefDraft } from "~/lib/chat-composer"

export type ChatInputMathDraft = MathRefDraft & {
  id: string
}

type ChatInputMathChipsProps = {
  drafts: Array<ChatInputMathDraft>
  pending?: boolean
  onEdit: (id: string) => void
  onRemove: (draft: ChatInputMathDraft) => void
}

export function ChatInputMathChips({
  drafts,
  pending = false,
  onEdit,
  onRemove,
}: ChatInputMathChipsProps) {
  if (drafts.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-2">
      {drafts.map((draft) => (
        <li key={draft.id} className="relative max-w-full">
          <button
            type="button"
            className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 pr-8 text-left hover:bg-muted/70"
            onClick={() => onEdit(draft.id)}
            disabled={pending}
          >
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {formatMathRef(draft.ref)}
            </span>
            <StaticMath latex={draft.latex} display="inline" />
          </button>
          <button
            type="button"
            className="absolute top-1 right-1 rounded-full bg-background/90 p-0.5 text-foreground shadow-sm"
            onClick={() => onRemove(draft)}
            aria-label={`Ta bort formel ${formatMathRef(draft.ref)}`}
            disabled={pending}
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  )
}
