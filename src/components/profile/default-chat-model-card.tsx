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
                  "h-auto min-w-0 flex-1 justify-start gap-3 rounded-md px-3 py-3 text-left shadow-none sm:justify-center sm:px-3",
                  active && "bg-background text-foreground shadow-sm",
                )}
              >
                <Star
                  className={cn(
                    "size-5 shrink-0",
                    active
                      ? "fill-amber-500 text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-base font-semibold tracking-tight">
                    {entry.name}
                  </span>
                  <span className="text-muted-foreground block truncate text-sm font-normal">
                    {entry.modelId.includes("/")
                      ? entry.modelId.slice(entry.modelId.indexOf("/") + 1)
                      : entry.modelId}
                  </span>
                  <span className="text-muted-foreground text-sm font-normal">
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
