import { ChevronLeft, ChevronRight } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "~/components/ui/button"
import { RoomTipDialog } from "~/components/rooms/tips/room-tip-dialog"
import { TipDemo } from "~/components/rooms/tips/tip-demos"
import { ROOM_TIPS } from "~/components/rooms/tips/room-tips-data"
import { cn } from "~/lib/utils"

function pickRandomTipIndex(): number {
  return Math.floor(Math.random() * ROOM_TIPS.length)
}

type RoomEmptyTipsProps = {
  onOpenOccasionsSettings?: () => void
  className?: string
}

export function RoomEmptyTips({
  onOpenOccasionsSettings,
  className,
}: RoomEmptyTipsProps) {
  const [tipIndex, setTipIndex] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setTipIndex(pickRandomTipIndex())
  }, [])

  if (tipIndex === null) {
    return (
      <div
        className={cn(
          "flex w-full max-w-md flex-col items-center gap-3 text-center",
          className,
        )}
      >
        <h3 className="text-base font-medium tracking-tight text-muted-foreground">
          Tips
        </h3>
        <div className="h-48 w-full animate-pulse rounded-xl border border-border/60 bg-muted/20" />
      </div>
    )
  }

  const tip = ROOM_TIPS[tipIndex] ?? ROOM_TIPS[0]!
  const Icon = tip.icon
  const tipCount = ROOM_TIPS.length

  function goPrev() {
    setTipIndex((current) => {
      if (current === null) return 0
      return (current - 1 + tipCount) % tipCount
    })
  }

  function goNext() {
    setTipIndex((current) => {
      if (current === null) return 0
      return (current + 1) % tipCount
    })
  }

  return (
    <div
      className={cn(
        "flex w-full max-w-md flex-col items-center gap-4 text-center",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={goPrev}
          aria-label="Föregående tips"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <h3 className="text-base font-medium tracking-tight text-muted-foreground">
          Tips
        </h3>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={goNext}
          aria-label="Nästa tips"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group flex w-full flex-col gap-3 rounded-xl border border-border/80 bg-muted/30 p-4 text-left transition-colors",
          "hover:border-border hover:bg-muted/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        )}
      >
        <div className="pointer-events-none select-none overflow-hidden rounded-lg">
          <TipDemo tipId={tip.id} />
        </div>
        <div className="flex items-start gap-3 px-0.5">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
            <Icon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-lg font-medium tracking-tight text-foreground">
              {tip.title}
            </p>
            <p className="line-clamp-3 text-base text-muted-foreground">
              {tip.description}
            </p>
            <span className="inline-block pt-0.5 text-sm font-medium text-primary group-hover:underline">
              Läs mer
            </span>
          </div>
        </div>
      </button>
      <RoomTipDialog
        tip={tip}
        open={open}
        onOpenChange={setOpen}
        onOpenOccasionsSettings={onOpenOccasionsSettings}
      />
    </div>
  )
}
