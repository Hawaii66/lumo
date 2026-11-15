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
    <div
      className={cn(
        "lumo-readable lumo-readable-sm flex flex-wrap gap-2",
        className,
      )}
    >
      {choices.map((choice) => (
        <Button
          key={choice.id}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          className="h-auto max-w-full whitespace-normal border-foreground/25 bg-background px-3 py-1.5 text-left text-[length:inherit] font-normal hover:bg-foreground/10 dark:border-foreground/30 dark:hover:bg-foreground/15"
          onClick={() => onSelect(choice.label)}
        >
          <InlineMarkdownMath markdown={choice.label} />
        </Button>
      ))}
    </div>
  )
}
