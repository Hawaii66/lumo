import { useMutation, useQuery } from "convex/react"
import { api } from "../../../convex/_generated/api"
import { MarkdownWithMath } from "~/components/lumo/markdown-with-math"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  DEFAULT_PROBLEM_TEXT_SIZE,
  PROBLEM_TEXT_SIZE_LABELS,
  PROBLEM_TEXT_SIZES,
  type ProblemTextSize,
} from "~/lib/problem-text-size"
import { cn } from "~/lib/utils"

const PREVIEW_MARKDOWN =
  "Beräkna integralen $\\int_0^1 x^2\\,dx$ och förenkla svaret."

export function ProblemTextSizeCard() {
  const viewer = useQuery(api.users.viewer)
  const updateProblemTextSize = useMutation(api.users.updateProblemTextSize)
  const size: ProblemTextSize =
    viewer?.problemTextSize ?? DEFAULT_PROBLEM_TEXT_SIZE
  const disabled = viewer === undefined

  if (viewer === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Textstorlek</CardTitle>
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
        <CardTitle>Textstorlek</CardTitle>
        <CardDescription>
          Storlek på uppgiftstext och formler i uppgiftsvyn och chatten. Medium är
          standardstorleken.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex w-full items-stretch gap-0.5 rounded-lg bg-muted/60 p-0.5"
          role="group"
          aria-label="Textstorlek för uppgifter och chatt"
        >
          {PROBLEM_TEXT_SIZES.map((value) => {
            const active = size === value
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
                  void updateProblemTextSize({ problemTextSize: value })
                }}
                className={cn(
                  "h-8 min-w-0 flex-1 rounded-md px-2 text-xs font-medium shadow-none",
                  active && "bg-background text-foreground shadow-sm",
                )}
              >
                {PROBLEM_TEXT_SIZE_LABELS[value]}
              </Button>
            )
          })}
        </div>

        <div
          className="rounded-lg bg-neutral-100 p-3 dark:bg-neutral-950"
          data-lumo-text-size={size}
        >
          <MarkdownWithMath markdown={PREVIEW_MARKDOWN} />
        </div>
      </CardContent>
    </Card>
  )
}
