import { useMutation, useQuery } from "convex/react"
import { Check, ChevronDown, Star } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Button } from "~/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu"
import {
  chatModelLevelLabel,
  normalizeChatModelLevel,
  resolveChatModelLevels,
  type ChatModelLevel,
} from "~/lib/chat-model-level"
import { cn } from "~/lib/utils"

type ChatModelPickerProps = {
  value: ChatModelLevel
  onChange: (level: ChatModelLevel) => void
  disabled?: boolean
  className?: string
}

export function ChatModelPicker({
  value,
  onChange,
  disabled = false,
  className,
}: ChatModelPickerProps) {
  const config = useQuery(api.credits.getConfig)
  const viewer = useQuery(api.users.viewer)
  const updateDefault = useMutation(api.users.updateDefaultChatModelLevel)

  const levels = resolveChatModelLevels(config?.chatModelLevels)
  const defaultLevel = normalizeChatModelLevel(viewer?.defaultChatModelLevel)
  const triggerLabel = chatModelLevelLabel(levels, value)

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-muted/40 px-2.5 py-1.5",
        className,
      )}
      role="group"
      aria-label="Chattmodell"
    >
      <span className="text-xs font-medium text-muted-foreground">Modell</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled}
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              className="h-7 min-w-28 justify-between gap-1.5 border-border bg-background px-2 text-xs font-medium"
              aria-label="Chattmodell"
            />
          }
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {triggerLabel}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56 p-1">
          {levels.map((entry) => {
            const selected = entry.level === value
            const isDefault = entry.level === defaultLevel
            return (
              <div
                key={entry.level}
                className="flex items-center gap-0.5 pr-0.5"
              >
                <DropdownMenuItem
                  className="min-w-0 flex-1 gap-2"
                  onClick={() => {
                    if (entry.level === value) return
                    onChange(entry.level)
                  }}
                >
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {entry.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {entry.creditCost}
                    </span>
                  </span>
                </DropdownMenuItem>
                <button
                  type="button"
                  disabled={disabled || viewer === null}
                  title={
                    isDefault
                      ? "Standard för nya chattar"
                      : "Sätt som standard för nya chattar"
                  }
                  aria-label={
                    isDefault
                      ? `${entry.name} är standard för nya chattar`
                      : `Sätt ${entry.name} som standard för nya chattar`
                  }
                  aria-pressed={isDefault}
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
                    isDefault && "text-amber-600 dark:text-amber-400",
                  )}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    if (isDefault) return
                    void updateDefault({
                      defaultChatModelLevel: entry.level,
                    })
                  }}
                >
                  <Star
                    className={cn(
                      "size-3.5",
                      isDefault && "fill-current",
                    )}
                    aria-hidden
                  />
                </button>
              </div>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
