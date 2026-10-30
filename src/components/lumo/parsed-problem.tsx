import { Eye, EyeOff } from "lucide-react"
import type { LumoParsedProblem } from "~/lib/lumo-content"
import { MarkdownWithMath } from "~/components/lumo/markdown-with-math"
import { cn } from "~/lib/utils"

type ParsedProblemViewProps = {
  problem: LumoParsedProblem
  className?: string
  showAnswer?: boolean
  /** When true, shows a facit toggle in the top-right of the header. */
  showFacitToggle?: boolean
  onShowAnswerChange?: (show: boolean) => void
}

export function ParsedProblemView({
  problem,
  className,
  showAnswer = true,
  showFacitToggle = false,
  onShowAnswerChange,
}: ParsedProblemViewProps) {
  return (
    <article className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">
          {problem.problemNumber}
        </h2>

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
