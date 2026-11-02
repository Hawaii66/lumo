import { Star } from "lucide-react"
import { cn } from "~/lib/utils"

export type ProblemStars = 0 | 1 | 2 | 3

export type ProblemStarEntry = {
  /** `""` = whole problem; otherwise `a`–`z`. */
  letter: string
  stars: 1 | 2 | 3
}

export function nextProblemStars(current: ProblemStars): ProblemStars {
  return ((current + 1) % 4) as ProblemStars
}

export function starsForLetter(
  entries: Array<ProblemStarEntry>,
  letter: string,
): ProblemStars {
  const entry = entries.find((row) => row.letter === letter)
  return entry?.stars ?? 0
}

type ProblemStarsDisplayProps = {
  entries: Array<ProblemStarEntry>
  className?: string
}

/** Read-only stars for the sidebar list. Letter-scoped → `a` ★★. */
export function ProblemStarsDisplay({
  entries,
  className,
}: ProblemStarsDisplayProps) {
  if (entries.length === 0) return null

  const letterEntries = entries
    .filter((entry) => entry.letter !== "")
    .sort((a, b) => a.letter.localeCompare(b.letter))

  if (letterEntries.length > 0) {
    const label = letterEntries
      .map((entry) => `${entry.letter}: ${entry.stars}`)
      .join(", ")
    return (
      <span
        className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
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
            <span className="inline-flex items-center gap-px">
              {Array.from({ length: entry.stars }, (_, i) => (
                <Star
                  key={i}
                  className="size-2.5 fill-amber-500 text-amber-500"
                  aria-hidden
                />
              ))}
            </span>
          </span>
        ))}
      </span>
    )
  }

  const whole = entries.find((entry) => entry.letter === "")
  if (whole === undefined) return null

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-px", className)}
      title={`${whole.stars} stjärn${whole.stars === 1 ? "a" : "or"}`}
      aria-label={`${whole.stars} stjärn${whole.stars === 1 ? "a" : "or"}`}
    >
      {Array.from({ length: whole.stars }, (_, i) => (
        <Star
          key={i}
          className="size-3 fill-amber-500 text-amber-500"
          aria-hidden
        />
      ))}
    </span>
  )
}

type ProblemStarsControlProps = {
  stars: ProblemStars
  onChange: (stars: ProblemStars) => void
  letter?: string
  /** When true, letter is rendered by the parent (e.g. subproblem heading). */
  hideLetter?: boolean
  className?: string
}

/** Clickable cycle control for one problem / deluppgift. */
export function ProblemStarsControl({
  stars,
  onChange,
  letter,
  hideLetter = false,
  className,
}: ProblemStarsControlProps) {
  const scope =
    letter !== undefined && letter !== "" ? `deluppgift (${letter})` : "uppgiften"
  const label =
    stars === 0
      ? `Ingen stjärna för ${scope} — klicka för att sätta 1`
      : `${stars} stjärn${stars === 1 ? "a" : "or"} för ${scope} — klicka för att ändra`

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => onChange(nextProblemStars(stars))}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      {!hideLetter && letter !== undefined && letter !== "" ? (
        <span className="mr-0.5 text-xs font-semibold text-muted-foreground">
          {letter}
        </span>
      ) : null}
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-3.5",
            n <= stars
              ? "fill-amber-500 text-amber-500"
              : "fill-none text-muted-foreground/40",
          )}
          aria-hidden
        />
      ))}
    </button>
  )
}
