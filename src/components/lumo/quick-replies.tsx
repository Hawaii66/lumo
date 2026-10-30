import type { ChatQuickReplyChoice } from "~/lib/chat-reply"
import { InlineMarkdownMath } from "~/components/lumo/markdown-with-math"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

type QuickRepliesProps = {
  choices: Array<ChatQuickReplyChoice>
  onSelect: (label: string) => void
  disabled?: boolean
  className?: string
}

export function QuickReplies({
  choices,
  onSelect,
  disabled,
  className,
}: QuickRepliesProps) {
  if (choices.length === 0) return null

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {choices.map((choice) => (
        <Button
          key={choice.id}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className="h-auto max-w-full whitespace-normal px-3 py-1.5 text-left"
          onClick={() => onSelect(choice.label)}
        >
          <InlineMarkdownMath markdown={choice.label} />
        </Button>
      ))}
    </div>
  )
}
