import type { RefObject } from "react"
import {
  TYPEAHEAD_VISIBLE_COUNT,
  type ProblemMentionOption,
} from "~/lib/chat-composer"
import { cn } from "~/lib/utils"

type ChatInputMentionTypeaheadProps = {
  options: Array<ProblemMentionOption>
  selectedIndex: number
  optionRefs: RefObject<Array<HTMLButtonElement | null>>
  onSelect: (option: ProblemMentionOption) => void
}

export function ChatInputMentionTypeahead({
  options,
  selectedIndex,
  optionRefs,
  onSelect,
}: ChatInputMentionTypeaheadProps) {
  return (
    <ul
      className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ maxHeight: `calc(${TYPEAHEAD_VISIBLE_COUNT} * 3.25rem)` }}
      role="listbox"
    >
      {options.map((option, index) => (
        <li key={`${option.id}-${option.fileName}`}>
          <button
            type="button"
            ref={(el) => {
              optionRefs.current[index] = el
            }}
            role="option"
            aria-selected={index === selectedIndex}
            className={cn(
              "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm",
              index === selectedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-muted",
            )}
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect(option)
            }}
          >
            <span className="font-medium">@{option.problemNumber}</span>
            <span className="text-xs text-muted-foreground">
              {option.fileName}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
