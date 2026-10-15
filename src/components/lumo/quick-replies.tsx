import type { QuickRepliesPart } from "~/lib/lumo-content"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

type QuickRepliesProps = {
  choices: QuickRepliesPart["choices"]
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
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {choices.map((choice) => (
        <Button
          key={choice.id}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onSelect(choice.label)}
        >
          {choice.label}
        </Button>
      ))}
    </div>
  )
}
