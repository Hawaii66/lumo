import { Loader2 } from "lucide-react"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

export type ChapterItem = {
  /** Index among ### (a)/(b) headings in the markdown reply. */
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
          <Button
            key={`${chapter.partIndex}-${chapter.label}`}
            type="button"
            variant={active ? "secondary" : "ghost"}
            size="icon-sm"
            title={`Hoppa till deluppgift ${chapter.label}`}
            aria-label={`Deluppgift ${chapter.label}`}
            aria-current={active ? "true" : undefined}
            className="text-xs font-semibold tabular-nums"
            onClick={() => onSelect(chapter.partIndex)}
          >
            {chapter.label}
          </Button>
        )
      })}
    </nav>
  )
}
