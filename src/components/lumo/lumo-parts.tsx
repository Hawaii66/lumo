import { Highlighter } from "lucide-react"
import {
  subproblemAnchorId,
  type LumoDocument,
  type LumoPart,
} from "~/lib/lumo-content"
import { QuickReplies } from "~/components/lumo/quick-replies"
import { StaticMath } from "~/components/lumo/static-math"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

type LumoPartsProps = {
  document: LumoDocument
  /** Stable message key used to build subproblem scroll anchors. */
  messageKey?: string
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
  /** Cite a latex part into the chat composer. */
  onCiteMath?: (latex: string) => void
  className?: string
}

function MathPart({
  latex,
  display,
  onCiteMath,
}: {
  latex: string
  display?: "inline" | "block"
  onCiteMath?: (latex: string) => void
}) {
  const isInline = display === "inline"

  return (
    <span
      className={cn(
        "group/math gap-1",
        isInline
          ? "inline-flex max-w-full items-center"
          : "flex w-full items-start",
      )}
    >
      <span
        className={cn("min-w-0", isInline ? "inline-block" : "block flex-1")}
      >
        <StaticMath latex={latex} display={display ?? "block"} />
      </span>
      {onCiteMath ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          data-cite-math-btn=""
          className={cn(
            "shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-primary",
            "group-hover/math:opacity-100 focus-visible:opacity-100",
            isInline ? "self-center" : "mt-1",
          )}
          title="Citera formel"
          aria-label="Citera formel"
          onClick={() => onCiteMath(latex)}
        >
          <Highlighter />
        </Button>
      ) : null}
    </span>
  )
}

function PartView({
  part,
  partIndex,
  messageKey,
  onQuickReply,
  quickRepliesDisabled,
  onCiteMath,
}: {
  part: LumoPart
  partIndex: number
  messageKey?: string
  onQuickReply?: (label: string) => void
  quickRepliesDisabled?: boolean
  onCiteMath?: (latex: string) => void
}) {
  switch (part.type) {
    case "text":
      return <span className="whitespace-pre-wrap">{part.content}</span>
    case "latex":
      return (
        <MathPart
          latex={part.content}
          display={part.display}
          onCiteMath={onCiteMath}
        />
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
  onCiteMath,
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
          onCiteMath={onCiteMath}
        />
      ))}
    </div>
  )
}
