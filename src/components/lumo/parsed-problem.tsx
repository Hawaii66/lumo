import { Eye, EyeOff } from "lucide-react"
import { useMemo, useState } from "react"
import type { LumoParsedProblem, ProblemFlag, ProblemImage } from "~/lib/lumo-content"
import { MarkdownWithMath } from "~/components/lumo/markdown-with-math"
import { ImageViewerSheet } from "~/components/rooms/image-viewer-sheet"
import {
  isCompletedForLetter,
  ProblemCompletionControl,
  type ProblemCompletionEntry,
} from "~/components/rooms/problem-completion"
import {
  occasionIdForLetter,
  occasionLabelForLetter,
  ProblemOccasionControl,
  ProblemOccasionReadonly,
  type ProblemOccasionEntry,
  type ProblemOccasionOption,
} from "~/components/rooms/problem-occasion"
import {
  ProblemStarsControl,
  ProblemStarsReadonly,
  starsForLetter,
  type ProblemStarEntry,
  type ProblemStars,
} from "~/components/rooms/problem-stars"
import { cn } from "~/lib/utils"

function flagNotice(flag: ProblemFlag): string {
  switch (flag.kind) {
    case "needs_pdf":
      return "Denna uppgift verkar kräva en figur, graf eller tabell. Öppna originalet för att se den."
    case "missing_answer":
      return "Inget facit hittades vid tolkningen."
    default: {
      const _exhaustive: never = flag.kind
      return _exhaustive
    }
  }
}

function groupImagesByLetter(
  images: Array<ProblemImage>,
): Record<string, Array<{ url: string }>> {
  const grouped: Record<string, Array<{ url: string }>> = {}
  for (const image of images) {
    const letter = (image.subproblemLetter ?? "").trim().toLowerCase()
    ;(grouped[letter] ??= []).push({ url: image.url })
  }
  return grouped
}

function ProblemImageGallery({
  images,
  label,
}: {
  images: Array<{ url: string }>
  label: string
}) {
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)

  if (images.length === 0) {
    return null
  }

  return (
    <>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label={label}>
        {images.map((image, index) => (
          <li key={`${image.url}-${index}`}>
            <button
              type="button"
              onClick={() => setViewerUrl(image.url)}
              className="block w-full overflow-hidden rounded-lg border border-border bg-muted/30 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <img
                src={image.url}
                alt={`${label} ${index + 1}`}
                className="max-h-64 w-full object-contain"
                loading="lazy"
              />
            </button>
          </li>
        ))}
      </ul>
      <ImageViewerSheet
        open={viewerUrl !== null}
        onOpenChange={(open) => {
          if (!open) setViewerUrl(null)
        }}
        fileName={label}
        url={viewerUrl}
      />
    </>
  )
}

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
  /** Room-scoped completion marks for this problem. */
  completionEntries?: Array<ProblemCompletionEntry>
  /** `letter` is `""` for whole-problem completion when there are no deluppgifter. */
  onCompletedChange?: (letter: string, completed: boolean) => void
  /** Available tillfällen for the assignment picker. */
  occasionOptions?: Array<ProblemOccasionOption>
  /** Room-scoped tillfälle assignments for this problem. */
  occasionEntries?: Array<ProblemOccasionEntry>
  /** `letter` is `""` for whole-problem assignment when there are no deluppgifter. */
  onOccasionChange?: (letter: string, occasionId: string | null) => void
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
  completionEntries = [],
  onCompletedChange,
  occasionOptions = [],
  occasionEntries = [],
  onOccasionChange,
}: ParsedProblemViewProps) {
  const letters = subproblemLetters
    .map((letter) => letter.trim().toLowerCase())
    .filter((letter) => /^[a-z]$/.test(letter))
  const hasSubproblems = letters.length > 0
  const showWholeProblemStars = !hasSubproblems
  const showWholeProblemCompletion =
    onCompletedChange !== undefined && !hasSubproblems
  const showWholeProblemOccasion = !hasSubproblems
  const questionImages = problem.questionImages ?? []
  const answerImages = problem.answerImages ?? []
  const questionImagesByLetter = useMemo(
    () => groupImagesByLetter(questionImages),
    [questionImages],
  )
  const answerImagesByLetter = useMemo(
    () => groupImagesByLetter(answerImages),
    [answerImages],
  )
  const flags = (problem.flags ?? []).filter(
    (flag) =>
      !(flag.kind === "needs_pdf" && questionImages.length > 0),
  )

  return (
    <article className={cn("space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight">
            {problem.problemNumber}
          </h2>
          {showWholeProblemStars ? (
            onStarsChange ? (
              <ProblemStarsControl
                stars={starsForLetter(starEntries, "")}
                onChange={(stars) => onStarsChange("", stars)}
              />
            ) : (
              <ProblemStarsReadonly stars={starsForLetter(starEntries, "")} />
            )
          ) : null}
          {showWholeProblemCompletion ? (
            <ProblemCompletionControl
              completed={isCompletedForLetter(completionEntries, "")}
              onChange={(completed) => onCompletedChange("", completed)}
            />
          ) : null}
          {showWholeProblemOccasion ? (
            onOccasionChange ? (
              <ProblemOccasionControl
                occasionId={occasionIdForLetter(occasionEntries, "")}
                options={occasionOptions}
                onChange={(occasionId) => onOccasionChange("", occasionId)}
              />
            ) : (
              <ProblemOccasionReadonly
                label={occasionLabelForLetter(occasionEntries, "")}
              />
            )
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

      {flags.length > 0 ? (
        <ul className="space-y-2" aria-label="Tolkningsflaggor">
          {flags.map((flag) => (
            <li
              key={flag.kind}
              className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
            >
              {flagNotice(flag)}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="space-y-3">
        <MarkdownWithMath
          markdown={problem.question}
          scopeKey={`q-${problem.problemNumber}`}
          imagesByLetter={questionImagesByLetter}
          renderImages={(images, letter) => (
            <ProblemImageGallery
              images={images}
              label={
                letter.length > 0
                  ? `Figur till (${letter})`
                  : "Figur till ingressen"
              }
            />
          )}
          subproblemStars={
            hasSubproblems
              ? {
                  getStars: (letter) => starsForLetter(starEntries, letter),
                  onChange: onStarsChange,
                }
              : undefined
          }
          subproblemCompletion={
            onCompletedChange && hasSubproblems
              ? {
                  isCompleted: (letter) =>
                    isCompletedForLetter(completionEntries, letter),
                  onChange: onCompletedChange,
                }
              : undefined
          }
          subproblemOccasion={
            hasSubproblems
              ? onOccasionChange
                ? {
                    options: occasionOptions,
                    getOccasionId: (letter) =>
                      occasionIdForLetter(occasionEntries, letter),
                    onChange: onOccasionChange,
                  }
                : {
                    getOccasionLabel: (letter) =>
                      occasionLabelForLetter(occasionEntries, letter),
                  }
              : undefined
          }
        />
      </section>

      {showAnswer ? (
        <section className="space-y-3 border-t border-border/60 pt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Svar
          </h3>
          {problem.answer.trim().length === 0 ? (
            <p className="text-sm italic text-muted-foreground">Inget svar</p>
          ) : (
            <MarkdownWithMath
              markdown={problem.answer}
              scopeKey={`a-${problem.problemNumber}`}
              imagesByLetter={answerImagesByLetter}
              renderImages={(images, letter) => (
                <ProblemImageGallery
                  images={images}
                  label={
                    letter.length > 0
                      ? `Figur till svar (${letter})`
                      : "Figur till svaret"
                  }
                />
              )}
            />
          )}
        </section>
      ) : null}
    </article>
  )
}
