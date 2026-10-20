import { Loader2 } from "lucide-react"
import { cn } from "~/lib/utils"

export type ChapterItem = {
  /** Index of the subproblem part in the Lumo document. */
  partIndex: number
  label: string
}

type ChapterSelectorProps = {
  chapters: Array<ChapterItem>
  loading?: boolean
  activePartIndex?: number | null
  onSelect: (partIndex: number) => void
  className?: string
}

export function ChapterSelector({
  chapters,
  loading = false,
  activePartIndex = null,
  onSelect,
  className,
}: ChapterSelectorProps) {
  if (!loading && chapters.length === 0) return null

  return (
    <nav
      aria-label="Deluppgifter"
      className={cn(
        "sticky top-0 flex w-8 shrink-0 flex-col items-center gap-1 self-start py-1",
        className,
      )}
    >
      {loading ? (
        <div
          className="flex size-7 items-center justify-center text-muted-foreground"
          title="Svarar…"
          aria-label="Svarar"
        >
          <Loader2 className="size-3.5 animate-spin" />
        </div>
      ) : null}
      {chapters.map((chapter) => {
        const active = activePartIndex === chapter.partIndex
        return (
          <button
            key={`${chapter.partIndex}-${chapter.label}`}
            type="button"
            title={`Hoppa till deluppgift ${chapter.label}`}
            aria-label={`Deluppgift ${chapter.label}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "flex size-7 items-center justify-center rounded-md text-xs font-semibold tabular-nums transition-colors",
              "hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground",
            )}
            onClick={() => onSelect(chapter.partIndex)}
          >
            {chapter.label}
          </button>
        )
      })}
    </nav>
  )
}
