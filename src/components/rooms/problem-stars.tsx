import { Star } from "lucide-react"
import { cn } from "~/lib/utils"

export type ProblemStars = 0 | 1 | 2 | 3

export function nextProblemStars(current: ProblemStars): ProblemStars {
  return ((current + 1) % 4) as ProblemStars
}

type ProblemStarsDisplayProps = {
  stars: ProblemStars
  className?: string
}

/** Read-only stars for the sidebar list (hidden when 0). */
export function ProblemStarsDisplay({
  stars,
  className,
}: ProblemStarsDisplayProps) {
  if (stars === 0) return null

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-px", className)}
      title={`${stars} stjärn${stars === 1 ? "a" : "or"}`}
      aria-label={`${stars} stjärn${stars === 1 ? "a" : "or"}`}
    >
      {Array.from({ length: stars }, (_, i) => (
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
  className?: string
}

/** Clickable cycle control for the problem detail header. */
export function ProblemStarsControl({
  stars,
  onChange,
  className,
}: ProblemStarsControlProps) {
  const label =
    stars === 0
      ? "Ingen stjärna — klicka för att sätta 1"
      : `${stars} stjärn${stars === 1 ? "a" : "or"} — klicka för att ändra`

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={() => onChange(nextProblemStars(stars))}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-1 transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className,
      )}
    >
      {[1, 2, 3].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-4",
            n <= stars
              ? "fill-amber-500 text-amber-500"
              : "text-muted-foreground/35",
          )}
          aria-hidden
        />
      ))}
    </button>
  )
}
