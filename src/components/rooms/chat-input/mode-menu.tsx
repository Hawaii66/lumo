import type { RefObject } from "react"
import { CHAT_MODES, type ChatMode } from "~/lib/chat-mode"
import { cn } from "~/lib/utils"

type ChatInputModeMenuProps = {
  activeMode: ChatMode | undefined
  selectedIndex: number
  optionRefs: RefObject<Array<HTMLButtonElement | null>>
  onSelect: (mode: ChatMode) => void
}

export function ChatInputModeMenu({
  activeMode,
  selectedIndex,
  optionRefs,
  onSelect,
}: ChatInputModeMenuProps) {
  return (
    <ul
      className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      role="listbox"
      aria-label="Välj chattläge"
    >
      {CHAT_MODES.map((option, index) => {
        const selected = activeMode === option.value
        const highlighted = index === selectedIndex
        return (
          <li key={option.value}>
            <button
              type="button"
              ref={(el) => {
                optionRefs.current[index] = el
              }}
              role="option"
              aria-selected={selected}
              className={cn(
                "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm",
                highlighted
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted",
              )}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect(option.value)
              }}
            >
              <span className="font-medium">
                {option.label}
                {selected ? " · aktiv" : ""}
              </span>
              <span className="text-xs text-muted-foreground">
                {option.description}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
