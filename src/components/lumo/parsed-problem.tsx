import type { LumoParsedProblem } from "~/lib/lumo-content"
import { StaticLumoParts } from "~/components/lumo/static-parts"
import { cn } from "~/lib/utils"

type ParsedProblemViewProps = {
  problem: LumoParsedProblem
  className?: string
  showAnswer?: boolean
}

export function ParsedProblemView({
  problem,
  className,
  showAnswer = true,
}: ParsedProblemViewProps) {
  return (
    <article className={cn("space-y-4", className)}>
      <h2 className="text-xl font-semibold tracking-tight">
        {problem.problemNumber}
      </h2>

      <section className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Fråga
        </h3>
        <StaticLumoParts parts={problem.question.parts} />
      </section>

      {showAnswer ? (
        <section className="space-y-2 border-t border-border/60 pt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Svar
          </h3>
          {problem.answer.parts.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Inget svar</p>
          ) : (
            <StaticLumoParts parts={problem.answer.parts} />
          )}
        </section>
      ) : null}
    </article>
  )
}
