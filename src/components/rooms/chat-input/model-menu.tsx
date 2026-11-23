import type { RefObject } from "react"
import {
  type ChatModelLevel,
  type ChatModelLevelConfig,
} from "~/lib/chat-model-level"
import { cn } from "~/lib/utils"

type ChatInputModelMenuProps = {
  levels: Array<ChatModelLevelConfig>
  activeLevel: ChatModelLevel | undefined
  selectedIndex: number
  optionRefs: RefObject<Array<HTMLButtonElement | null>>
  onSelect: (level: ChatModelLevel) => void
}

/** Composer model list — custom listbox so keyboard selection in use-composer stays intact. */
export function ChatInputModelMenu({
  levels,
  activeLevel,
  selectedIndex,
  optionRefs,
  onSelect,
}: ChatInputModelMenuProps) {
  return (
    <ul
      className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md"
      role="listbox"
      aria-label="Välj chattmodell"
    >
      {levels.map((option, index) => {
        const selected = activeLevel === option.level
        const highlighted = index === selectedIndex
        return (
          <li key={option.level}>
            <button
              type="button"
              ref={(el) => {
                optionRefs.current[index] = el
              }}
              role="option"
              aria-selected={selected}
              data-selected={highlighted ? "true" : undefined}
              className={cn(
                "flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left text-sm outline-hidden",
                highlighted
                  ? "bg-muted text-foreground"
                  : "hover:bg-muted/70",
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect(option.level)
              }}
            >
              <span className="font-medium">
                {option.name}
                {selected ? " · aktiv" : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {option.creditCost} credits per meddelande
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
