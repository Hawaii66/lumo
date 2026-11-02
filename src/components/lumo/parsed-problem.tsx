import { Eye, EyeOff } from "lucide-react"
import type { LumoParsedProblem } from "~/lib/lumo-content"
import { MarkdownWithMath } from "~/components/lumo/markdown-with-math"
import {
  ProblemStarsControl,
  starsForLetter,
  type ProblemStarEntry,
  type ProblemStars,
} from "~/components/rooms/problem-stars"
import { cn } from "~/lib/utils"

type ParsedProblemViewProps = {
  problem: LumoParsedProblem
  className?: string
  showAnswer?: boolean
  /** When true, shows a facit toggle in the top-right of the header. */
  showFacitToggle?: boolean
  onShowAnswerChange?: (show: boolean) => void
  /** Deluppgift letters from the question markdown (e.g. ["a","b"]). */
  subproblemLetters?: Array<string>
  /** Room-scoped difficulty entries for this problem. */
  starEntries?: Array<ProblemStarEntry>
  /** `letter` is `""` for whole-problem stars when there are no deluppgifter. */
  onStarsChange?: (letter: string, stars: ProblemStars) => void
}

export function ParsedProblemView({
  problem,
  className,
  showAnswer = true,
  showFacitToggle = false,
  onShowAnswerChange,
  subproblemLetters = [],
  starEntries = [],
  onStarsChange,
}: ParsedProblemViewProps) {
  const letters = subproblemLetters
    .map((letter) => letter.trim().toLowerCase())
    .filter((letter) => /^[a-z]$/.test(letter))
  const hasSubproblems = letters.length > 0
  const showWholeProblemStars =
    onStarsChange !== undefined && !hasSubproblems

  return (
    <article className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight">
            {problem.problemNumber}
          </h2>
          {showWholeProblemStars ? (
            <ProblemStarsControl
              stars={starsForLetter(starEntries, "")}
              onChange={(stars) => onStarsChange("", stars)}
            />
          ) : null}
        </div>

        {showFacitToggle && onShowAnswerChange ? (
          <button
            type="button"
            onClick={() => onShowAnswerChange(!showAnswer)}
            aria-pressed={showAnswer}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors",
              "hover:bg-muted/60 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              showAnswer && "border-primary/40 bg-primary/5 text-primary",
            )}
          >
            {showAnswer ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
            {showAnswer ? "Dölj facit" : "Visa facit"}
          </button>
        ) : null}
      </div>

      <section className="space-y-2">
        <MarkdownWithMath
          markdown={problem.question}
          scopeKey={`q-${problem.problemNumber}`}
          subproblemStars={
            onStarsChange && hasSubproblems
              ? {
                  getStars: (letter) => starsForLetter(starEntries, letter),
                  onChange: onStarsChange,
                }
              : undefined
          }
        />
      </section>

      {showAnswer ? (
        <section className="space-y-2 border-t border-border/60 pt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Svar
          </h3>
          {problem.answer.trim().length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Inget svar</p>
          ) : (
            <MarkdownWithMath
              markdown={problem.answer}
              scopeKey={`a-${problem.problemNumber}`}
            />
          )}
        </section>
      ) : null}
    </article>
  )
}
