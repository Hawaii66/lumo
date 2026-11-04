import { CHAT_MODES, type ChatMode } from "~/lib/chat-mode"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
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
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next == null) return
          onChange(next as ChatMode)
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Chattläge"
          className="h-7 min-w-28 border-border bg-background px-2 text-xs font-medium"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {CHAT_MODES.map((mode) => (
            <SelectItem
              key={mode.value}
              value={mode.value}
              title={mode.description}
            >
              {mode.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
