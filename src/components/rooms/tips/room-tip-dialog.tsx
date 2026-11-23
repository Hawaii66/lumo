import { Link } from "@tanstack/react-router"
import { Button } from "~/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"
import { TipDemo } from "~/components/rooms/tips/tip-demos"
import type { RoomTip } from "~/components/rooms/tips/room-tips-data"

type RoomTipDialogProps = {
  tip: RoomTip | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenOccasionsSettings?: () => void
}

export function RoomTipDialog({
  tip,
  open,
  onOpenChange,
  onOpenOccasionsSettings,
}: RoomTipDialogProps) {
  function handleAction() {
    if (tip?.action?.kind === "occasions") {
      onOpenChange(false)
      onOpenOccasionsSettings?.()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        {tip ? (
          <>
            <TipDemo tipId={tip.id} />
            <DialogHeader>
              <DialogTitle>{tip.title}</DialogTitle>
              <DialogDescription>{tip.description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Stäng
              </Button>
              {tip.action?.kind === "profile" ? (
                <Button
                  render={<Link to="/profile" />}
                  onClick={() => onOpenChange(false)}
                >
                  {tip.action.label}
                </Button>
              ) : null}
              {tip.action?.kind === "credits" ? (
                <Button
                  render={<Link to="/profile" search={{ tab: "credits" }} />}
                  onClick={() => onOpenChange(false)}
                >
                  {tip.action.label}
                </Button>
              ) : null}
              {tip.action?.kind === "occasions" ? (
                <Button type="button" onClick={handleAction}>
                  {tip.action.label}
                </Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
