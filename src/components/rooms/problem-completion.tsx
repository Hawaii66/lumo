import { Check } from "lucide-react"
import { celebrateFromPoint } from "~/lib/celebrate"
import { cn } from "~/lib/utils"

export type ProblemCompletionEntry = {
  /** `""` = whole problem; otherwise `a`–`z`. */
  letter: string
}

export function isCompletedForLetter(
  entries: Array<ProblemCompletionEntry>,
  letter: string,
): boolean {
  return entries.some((row) => row.letter === letter)
}

type ProblemCompletionDisplayProps = {
  entries: Array<ProblemCompletionEntry>
  className?: string
}

/** Read-only checkmarks for the sidebar list — only when completed. */
export function ProblemCompletionDisplay({
  entries,
  className,
}: ProblemCompletionDisplayProps) {
  if (entries.length === 0) return null

  const letterEntries = entries
    .filter((entry) => entry.letter !== "")
    .sort((a, b) => a.letter.localeCompare(b.letter))

  if (letterEntries.length > 0) {
    const label = letterEntries
      .map((entry) => `${entry.letter}: klar`)
      .join(", ")
    return (
      <span
        className={cn("inline-flex shrink-0 items-center gap-1", className)}
        title={label}
        aria-label={label}
      >
        {letterEntries.map((entry) => (
          <span
            key={entry.letter}
            className="inline-flex items-center gap-0.5"
          >
            <span className="text-[10px] font-medium text-muted-foreground">
              {entry.letter}:
            </span>
            <Check
              className="size-2.5 stroke-[3] text-emerald-600"
              aria-hidden
            />
          </span>
        ))}
      </span>
    )
  }

  const whole = entries.find((entry) => entry.letter === "")
  if (whole === undefined) return null

  return (
    <span
      className={cn("inline-flex shrink-0 items-center", className)}
      title="Klar"
      aria-label="Klar"
    >
      <Check className="size-3 stroke-[3] text-emerald-600" aria-hidden />
    </span>
  )
}

type ProblemCompletionControlProps = {
  completed: boolean
  onChange: (completed: boolean) => void
  letter?: string
  className?: string
}

/** Toggle check control for the problem detail view. */
export function ProblemCompletionControl({
  completed,
  onChange,
  letter,
  className,
}: ProblemCompletionControlProps) {
  const scope =
    letter !== undefined && letter !== "" ? `deluppgift (${letter})` : "uppgiften"
  const label = completed
    ? `Markera ${scope} som inte klar`
    : `Markera ${scope} som klar`

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={completed}
      onClick={(event) => {
        const next = !completed
        if (next) {
          const rect = event.currentTarget.getBoundingClientRect()
          celebrateFromPoint(
            (rect.left + rect.width / 2) / window.innerWidth,
            (rect.top + rect.height / 2) / window.innerHeight,
          )
        }
        onChange(next)
      }}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md border transition-[transform,colors,background-color,border-color] duration-100",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "active:scale-90",
        completed
          ? "border-emerald-600/50 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25"
          : "border-border text-muted-foreground hover:bg-muted/60",
        className,
      )}
    >
      <Check
        className={cn(
          "size-4 transition-[opacity,transform] duration-150",
          completed ? "stroke-[3] opacity-100 scale-100" : "scale-90",
        )}
        aria-hidden
      />
    </button>
  )
}
