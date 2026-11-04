import type { RefObject } from "react"
import type { SlashCommand } from "~/lib/chat-composer"
import { cn } from "~/lib/utils"

type ChatInputSlashTypeaheadProps = {
  options: Array<SlashCommand>
  selectedIndex: number
  optionRefs: RefObject<Array<HTMLButtonElement | null>>
  onSelect: (option: SlashCommand) => void
}

/** Slash typeahead — custom listbox so composer keyboard nav stays intact. */
export function ChatInputSlashTypeahead({
  options,
  selectedIndex,
  optionRefs,
  onSelect,
}: ChatInputSlashTypeaheadProps) {
  return (
    <ul
      className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md"
      role="listbox"
    >
      {options.map((option, index) => (
        <li key={option.id}>
          <button
            type="button"
            ref={(el) => {
              optionRefs.current[index] = el
            }}
            role="option"
            aria-selected={index === selectedIndex}
            data-selected={index === selectedIndex ? "true" : undefined}
            className={cn(
              "flex w-full flex-col items-start rounded-lg px-2 py-1.5 text-left text-sm outline-hidden",
              index === selectedIndex
                ? "bg-muted text-foreground"
                : "hover:bg-muted/70",
            )}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(option)
            }}
          >
            <span className="font-medium">{option.label}</span>
            <span className="text-xs text-muted-foreground">
              {option.description}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
