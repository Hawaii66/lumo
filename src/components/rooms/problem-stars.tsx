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

function starCountLabel(stars: number) {
  return `${stars} stjärn${stars === 1 ? "a" : "or"}`
}

/**
 * Read-only stars for the sidebar list.
 * Letter ratings collapse to distinct levels: one cluster when every
 * deluppgift shares a level, one cluster per level when they differ.
 */
export function ProblemStarsDisplay({
  entries,
  className,
}: ProblemStarsDisplayProps) {
  if (entries.length === 0) return null

  const letterEntries = entries
    .filter((entry) => entry.letter !== "")
    .sort((a, b) => a.letter.localeCompare(b.letter))

  if (letterEntries.length > 0) {
    const lettersByLevel = new Map<1 | 2 | 3, Array<string>>()
    for (const entry of letterEntries) {
      const letters = lettersByLevel.get(entry.stars) ?? []
      letters.push(entry.letter)
      lettersByLevel.set(entry.stars, letters)
    }
    const levels = [...lettersByLevel.keys()].sort((a, b) => a - b)
    const label = levels
      .map((stars) => {
        const letters = lettersByLevel.get(stars)!.join(", ")
        return `${letters}: ${starCountLabel(stars)}`
      })
      .join("; ")
    return (
      <span
        className={cn("inline-flex shrink-0 items-center gap-1", className)}
        title={label}
        aria-label={label}
      >
        {levels.flatMap((stars, index) => {
          const cluster = (
            <span key={stars} className="inline-flex items-center gap-px">
              {Array.from({ length: stars }, (_, i) => (
                <Star
                  key={i}
                  className="size-2.5 fill-amber-500 text-amber-500"
                  aria-hidden
                />
              ))}
            </span>
          )
          if (index === 0) return [cluster]
          return [
            <span
              key={`sep-${stars}`}
              className="text-[10px] leading-none text-muted-foreground"
              aria-hidden
            >
              |
            </span>,
            cluster,
          ]
        })}
      </span>
    )
  }

  const whole = entries.find((entry) => entry.letter === "")
  if (whole === undefined) return null

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-px", className)}
      title={starCountLabel(whole.stars)}
      aria-label={starCountLabel(whole.stars)}
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

type ProblemStarsReadonlyProps = {
  stars: ProblemStars
  letter?: string
  /** When true, letter is rendered by the parent (e.g. subproblem heading). */
  hideLetter?: boolean
  className?: string
}

/** Read-only star level for the problem detail view. */
export function ProblemStarsReadonly({
  stars,
  letter,
  hideLetter = false,
  className,
}: ProblemStarsReadonlyProps) {
  const scope =
    letter !== undefined && letter !== "" ? `deluppgift (${letter})` : "uppgiften"
  const label =
    stars === 0
      ? `Inga stjärnor för ${scope}`
      : `${starCountLabel(stars)} för ${scope}`

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-0.5",
        className,
      )}
      title={label}
      aria-label={label}
    >
      {!hideLetter && letter !== undefined && letter !== "" ? (
        <span className="mr-0.5 text-xs font-semibold text-muted-foreground">
          {letter}
        </span>
      ) : null}
      {([1, 2, 3] as const).map((n) => {
        const filled = n <= stars
        return (
          <Star
            key={n}
            className={cn(
              "size-3.5",
              filled
                ? "fill-amber-500 text-amber-500"
                : "fill-none text-muted-foreground/50",
            )}
            aria-hidden
          />
        )
      })}
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
                  : "fill-none text-muted-foreground",
              )}
              aria-hidden
            />
          </button>
        )
      })}
    </span>
  )
}
