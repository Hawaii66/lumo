import type { LumoDocument, LumoPart } from "~/lib/lumo-content"
import { FillInBlankFromPart } from "~/components/lumo/fill-in-blank"
import { QuickReplies } from "~/components/lumo/quick-replies"
import { SolutionStepsFromPart } from "~/components/lumo/solution-steps"
import { StaticMath } from "~/components/lumo/static-math"
import { cn } from "~/lib/utils"

type LumoPartsProps = {
  document: LumoDocument
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
  className?: string
}

function PartView({
  part,
  onQuickReply,
  quickRepliesDisabled,
}: {
  part: LumoPart
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
}) {
  switch (part.type) {
    case "text":
      return <span className="whitespace-pre-wrap">{part.content}</span>
    case "latex":
      return (
        <StaticMath latex={part.content} display={part.display ?? "block"} />
      )
    case "fillBlank":
      return <FillInBlankFromPart part={part} />
    case "solution":
      return <SolutionStepsFromPart part={part} />
    case "quickReplies":
      if (!onQuickReply) return null
      return (
        <QuickReplies
          choices={part.choices}
          onSelect={onQuickReply}
          disabled={quickRepliesDisabled}
        />
      )
    case "subproblem":
      return (
        <p className="text-sm font-medium text-muted-foreground">
          Deluppgift {part.label}
        </p>
      )
    default: {
      const _exhaustive: never = part
      return _exhaustive
    }
  }
}

export function LumoParts({
  document,
  onQuickReply,
  quickRepliesDisabled,
  className,
}: LumoPartsProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {document.parts.map((part, index) => (
        <PartView
          key={`${part.type}-${index}`}
          part={part}
          onQuickReply={onQuickReply}
          quickRepliesDisabled={quickRepliesDisabled}
        />
      ))}
    </div>
  )
}
