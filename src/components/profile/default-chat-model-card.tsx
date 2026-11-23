import { useMutation, useQuery } from "convex/react"
import { Star } from "lucide-react"
import { api } from "../../../convex/_generated/api"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  normalizeChatModelLevel,
  resolveChatModelLevels,
  type ChatModelLevel,
} from "~/lib/chat-model-level"
import { cn } from "~/lib/utils"

export function DefaultChatModelCard() {
  const viewer = useQuery(api.users.viewer)
  const config = useQuery(api.credits.getConfig)
  const updateDefault = useMutation(api.users.updateDefaultChatModelLevel)

  if (viewer === undefined || config === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Standardmodell</CardTitle>
          <CardDescription>Hämtar inställning…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (viewer === null) {
    return null
  }

  const levels = resolveChatModelLevels(config?.chatModelLevels)
  const selected = normalizeChatModelLevel(viewer.defaultChatModelLevel)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Standardmodell</CardTitle>
        <CardDescription>
          Används för nya chattar om du inte väljer något annat. Du kan också
          sätta standard med stjärnan i modellmenyn i chatten.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="flex w-full flex-col gap-1.5 sm:flex-row sm:items-stretch sm:gap-0.5 sm:rounded-lg sm:bg-muted/60 sm:p-0.5"
          role="group"
          aria-label="Standardmodell för nya chattar"
        >
          {levels.map((entry) => {
            const active = selected === entry.level
            return (
              <Button
                key={entry.level}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={active}
                onClick={() => {
                  if (active) return
                  void updateDefault({
                    defaultChatModelLevel: entry.level as ChatModelLevel,
                  })
                }}
                className={cn(
                  "h-auto min-w-0 flex-1 justify-start gap-2 rounded-md px-3 py-2 text-left text-xs font-medium shadow-none sm:justify-center sm:px-2",
                  active && "bg-background text-foreground shadow-sm",
                )}
              >
                <Star
                  className={cn(
                    "size-3.5 shrink-0",
                    active
                      ? "fill-amber-500 text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-medium">{entry.name}</span>
                  <span className="text-muted-foreground font-normal">
                    {entry.creditCost} credits/meddelande
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
