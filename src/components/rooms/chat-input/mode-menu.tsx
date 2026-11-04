import type { RefObject } from "react"
import { CHAT_MODES, type ChatMode } from "~/lib/chat-mode"
import { cn } from "~/lib/utils"

type ChatInputModeMenuProps = {
  activeMode: ChatMode | undefined
  selectedIndex: number
  optionRefs: RefObject<Array<HTMLButtonElement | null>>
  onSelect: (mode: ChatMode) => void
}

/** Composer mode list — custom listbox (not DropdownMenu) so keyboard selection in use-composer stays intact. */
export function ChatInputModeMenu({
  activeMode,
  selectedIndex,
  optionRefs,
  onSelect,
}: ChatInputModeMenuProps) {
  return (
    <ul
      className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md"
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
              data-selected={highlighted ? "true" : undefined}
              className={cn(
                "flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left text-sm outline-hidden",
                highlighted
                  ? "bg-muted text-foreground"
                  : "hover:bg-muted/70",
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
