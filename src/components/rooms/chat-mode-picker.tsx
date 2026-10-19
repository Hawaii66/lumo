import { CHAT_MODES, type ChatMode } from "~/lib/chat-mode"
import { cn } from "~/lib/utils"

type ChatModePickerProps = {
  value: ChatMode
  onChange: (mode: ChatMode) => void
  disabled?: boolean
  className?: string
}

export function ChatModePicker({
  value,
  onChange,
  disabled = false,
  className,
}: ChatModePickerProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1.5",
        className,
      )}
      role="group"
      aria-label="Chattläge"
    >
      <span className="text-xs font-medium text-muted-foreground">Läge</span>
      <select
        value={value}
        disabled={disabled}
        aria-label="Chattläge"
        onChange={(event) => {
          onChange(event.target.value as ChatMode)
        }}
        className={cn(
          "h-7 rounded-md border border-border bg-background px-2 text-xs font-medium text-foreground",
          "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        {CHAT_MODES.map((mode) => (
          <option
            key={mode.value}
            value={mode.value}
            title={mode.description}
          >
            {mode.label}
          </option>
        ))}
      </select>
    </div>
  )
}
