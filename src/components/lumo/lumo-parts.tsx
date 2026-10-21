import {
  subproblemAnchorId,
  type LumoDocument,
  type LumoPart,
} from "~/lib/lumo-content"
import { QuickReplies } from "~/components/lumo/quick-replies"
import { StaticMath } from "~/components/lumo/static-math"
import { cn } from "~/lib/utils"

type LumoPartsProps = {
  document: LumoDocument
  /** Stable message key used to build subproblem scroll anchors. */
  messageKey?: string
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
  className?: string
}

function PartView({
  part,
  partIndex,
  messageKey,
  onQuickReply,
  quickRepliesDisabled,
}: {
  part: LumoPart
  partIndex: number
  messageKey?: string
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
}) {
  switch (part.type) {
    case "text":
      return <span className="whitespace-pre-wrap">{part.content}</span>
    case "latex":
      return (
        <span
          data-cite-math=""
          data-latex={part.content}
          className={
            part.display === "inline" ? "inline-block" : "block w-full"
          }
        >
          <StaticMath latex={part.content} display={part.display ?? "block"} />
        </span>
      )
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
        <p
          id={
            messageKey
              ? subproblemAnchorId(messageKey, partIndex)
              : undefined
          }
          data-lumo-subproblem={part.label}
          className="scroll-mt-3 text-sm font-medium text-muted-foreground"
        >
          Deluppgift {part.label}
        </p>
      )
    case "case":
      return (
        <p className="text-sm font-medium text-muted-foreground">
          Fall{part.label ? ` ${part.label}` : ""}
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
  messageKey,
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
          partIndex={index}
          messageKey={messageKey}
          onQuickReply={onQuickReply}
          quickRepliesDisabled={quickRepliesDisabled}
        />
      ))}
    </div>
  )
}
