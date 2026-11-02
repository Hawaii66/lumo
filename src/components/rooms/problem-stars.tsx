import { Star } from "lucide-react"
import { cn } from "~/lib/utils"

export type ProblemStars = 0 | 1 | 2 | 3

export type ProblemStarEntry = {
  /** `""` = whole problem; otherwise `a`–`z`. */
  letter: string
  stars: 1 | 2 | 3
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

/** Per-star click control: pick a level, or click the current level to clear. */
export function ProblemStarsControl({
  stars,
  onChange,
  letter,
  hideLetter = false,
  className,
}: ProblemStarsControlProps) {
  const scope =
    letter !== undefined && letter !== "" ? `deluppgift (${letter})` : "uppgiften"

  function selectLevel(level: 1 | 2 | 3) {
    onChange(stars === level ? 0 : level)
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5",
        className,
      )}
      role="group"
      aria-label={`Stjärnor för ${scope}`}
    >
      {!hideLetter && letter !== undefined && letter !== "" ? (
        <span className="mr-0.5 text-xs font-semibold text-muted-foreground">
          {letter}
        </span>
      ) : null}
      {([1, 2, 3] as const).map((n) => {
        const filled = n <= stars
        const label =
          stars === n
            ? `Ta bort stjärnor för ${scope}`
            : `Sätt ${n} stjärn${n === 1 ? "a" : "or"} för ${scope}`
        return (
          <button
            key={n}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={stars === n}
            onClick={() => selectLevel(n)}
            className={cn(
              "rounded-sm p-0.5 transition-[transform,colors,background-color] duration-100",
              "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              "active:scale-90 active:bg-amber-500/15",
            )}
          >
            <Star
              className={cn(
                "size-3.5 transition-[fill,color,transform] duration-150",
                filled
                  ? "fill-amber-500 text-amber-500 scale-110"
                  : "fill-none text-muted-foreground/40",
              )}
              aria-hidden
            />
          </button>
        )
      })}
    </span>
  )
}
