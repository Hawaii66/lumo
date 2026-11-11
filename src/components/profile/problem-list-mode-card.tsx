import {
  IconChevronDown,
  IconCircleCheck,
  IconSearch,
  IconStarFilled,
} from "@tabler/icons-react"
import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  DEFAULT_PROBLEM_LIST_MODE,
  PROBLEM_LIST_MODE_LABELS,
  PROBLEM_LIST_MODES,
  type ProblemListMode,
} from "~/lib/problem-list-mode"
import { cn } from "~/lib/utils"

type PreviewProblem = {
  num: string
  stars: 1 | 2 | 3
  selected?: boolean
  done?: boolean
}

type PreviewChapter = {
  label: string
  problems: PreviewProblem[]
}

const PREVIEW_FILE = "Övningar.pdf"
const PREVIEW_CHAPTERS: PreviewChapter[] = [
  {
    label: "1",
    problems: [
      { num: "1.1", stars: 1 },
      { num: "1.2", stars: 2, selected: true, done: true },
    ],
  },
  {
    label: "2",
    problems: [{ num: "2.1", stars: 2 }],
  },
]

function PreviewProblemRow({ problem }: { problem: PreviewProblem }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px]",
        problem.selected
          ? "bg-primary/20 text-neutral-900 dark:text-white"
          : "text-neutral-700 dark:text-neutral-300",
      )}
    >
      <span className="min-w-0 flex-1 truncate font-medium tabular-nums">
        {problem.num}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1">
        <span className="inline-flex items-center gap-px">
          {Array.from({ length: problem.stars }, (_, i) => (
            <IconStarFilled key={i} className="size-2 text-amber-500" />
          ))}
        </span>
        {problem.done ? (
          <IconCircleCheck className="size-2.5 text-emerald-500" />
        ) : null}
      </span>
    </div>
  )
}

function ProblemListModePreview({ mode }: { mode: ProblemListMode }) {
  const problemCount = PREVIEW_CHAPTERS.reduce(
    (sum, chapter) => sum + chapter.problems.length,
    0,
  )

  return (
    <div
      aria-hidden
      className="flex min-h-0 w-full flex-col gap-1.5 overflow-hidden rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-neutral-100 px-2 text-[9px] text-neutral-500 dark:bg-neutral-950">
        <IconSearch className="size-2.5 shrink-0" />
        <span className="truncate">Sök uppgifter…</span>
      </div>

      <div className="flex shrink-0 items-stretch gap-0.5 rounded-md bg-neutral-200 p-0.5 dark:bg-neutral-800">
        <div className="flex h-5 min-w-0 flex-1 items-center justify-center rounded bg-white text-[8px] font-medium text-neutral-800 shadow-sm dark:bg-neutral-950 dark:text-neutral-200">
          Alla
        </div>
        <div className="flex min-w-0 flex-[3] items-stretch">
          {([1, 2, 3] as const).map((level) => (
            <div
              key={level}
              className="flex h-5 min-w-0 flex-1 items-center justify-center gap-px rounded-md"
            >
              {Array.from({ length: level }, (_, i) => (
                <IconStarFilled key={i} className="size-2 text-neutral-500" />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        {mode === "tillfallen" ? (
          <>
            <div className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium tracking-wide text-neutral-500 uppercase">
              <IconChevronDown className="size-2.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate normal-case">
                Lektion 1 (30/11)
              </span>
              <span className="shrink-0 rounded bg-neutral-200 px-1 py-px text-[8px] font-medium normal-case tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                2
              </span>
            </div>
            <div className="space-y-0.5">
              <PreviewProblemRow
                problem={{ num: "1.1", stars: 1, done: true }}
              />
              <PreviewProblemRow
                problem={{ num: "1.2a", stars: 2, selected: true }}
              />
            </div>
            <div className="mt-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium tracking-wide text-neutral-500 uppercase">
              <IconChevronDown className="size-2.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate normal-case">
                Otilldelade
              </span>
              <span className="shrink-0 rounded bg-neutral-200 px-1 py-px text-[8px] font-medium normal-case tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                1
              </span>
            </div>
            <PreviewProblemRow problem={{ num: "2.1", stars: 2 }} />
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[9px] font-medium tracking-wide text-neutral-500 uppercase">
              <IconChevronDown className="size-2.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate normal-case">
                {PREVIEW_FILE}
              </span>
              <span className="shrink-0 rounded bg-neutral-200 px-1 py-px text-[8px] font-medium normal-case tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                {problemCount}
              </span>
            </div>

            {mode === "tree" ? (
              <div className="space-y-1">
                {PREVIEW_CHAPTERS.map((chapter) => (
                  <div key={chapter.label} className="min-w-0">
                    <div className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-medium tracking-wide text-neutral-500 uppercase">
                      <IconChevronDown className="size-2 shrink-0" />
                      <span className="min-w-0 flex-1 truncate normal-case tabular-nums">
                        {chapter.label}
                      </span>
                      <span className="shrink-0 rounded bg-neutral-200 px-1 py-px text-[7px] font-medium normal-case tabular-nums text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {chapter.problems.length}
                      </span>
                    </div>
                    <div className="mt-0.5 space-y-0.5 border-l border-neutral-200 pl-1.5 ml-1 dark:border-neutral-800">
                      {chapter.problems.map((problem) => (
                        <PreviewProblemRow
                          key={problem.num}
                          problem={problem}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {PREVIEW_CHAPTERS.flatMap((chapter) => chapter.problems).map(
                  (problem) => (
                    <PreviewProblemRow key={problem.num} problem={problem} />
                  ),
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function ProblemListModeCard() {
  const viewer = useQuery(api.users.viewer)
  const updateProblemListMode = useMutation(api.users.updateProblemListMode)
  const mode = viewer?.problemListMode ?? DEFAULT_PROBLEM_LIST_MODE
  const disabled = viewer === undefined

  if (viewer === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Uppgiftslista</CardTitle>
          <CardDescription>Hämtar inställning…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (viewer === null) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Uppgiftslista</CardTitle>
        <CardDescription>
          Välj hur uppgifter grupperas i alla rum. Träd visar kapitel (1, 2).
          Tillfällen grupperar efter lektion/dag från rummets inställningar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex w-full items-stretch gap-0.5 rounded-lg bg-muted/60 p-0.5"
          role="group"
          aria-label="Uppgiftslistans vy"
        >
          {PROBLEM_LIST_MODES.map((value) => {
            const active = mode === value
            return (
              <Button
                key={value}
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-pressed={active}
                onClick={() => {
                  if (active) return
                  void updateProblemListMode({ problemListMode: value })
                }}
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-md px-2 text-xs font-medium shadow-none",
                  active && "bg-background text-foreground shadow-sm",
                )}
              >
                {PROBLEM_LIST_MODE_LABELS[value]}
              </Button>
            )
          })}
        </div>

        <div className="rounded-lg bg-neutral-100 p-3 dark:bg-neutral-950">
          <ProblemListModePreview mode={mode} />
        </div>
      </CardContent>
    </Card>
  )
}
