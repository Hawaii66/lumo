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
      className={cn("flex flex-wrap gap-1.5", className)}
      role="group"
      aria-label="Chattläge"
    >
      {CHAT_MODES.map((mode) => {
        const selected = value === mode.value
        return (
          <button
            key={mode.value}
            type="button"
            disabled={disabled}
            title={mode.description}
            aria-pressed={selected}
            onClick={() => onChange(mode.value)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}
