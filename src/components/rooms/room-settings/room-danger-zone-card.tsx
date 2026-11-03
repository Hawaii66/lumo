import { useMutation } from "convex/react"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog"

export function RoomDangerZoneCard({ roomId }: { roomId: Id<"rooms"> }) {
  const navigate = useNavigate()
  const removeRoom = useMutation(api.rooms.remove)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Radera rum</CardTitle>
          <CardDescription>
            Tar bort rummet och tillhörande filer, chattar och tvillingar för dig
            och övriga medlemmar. Publicerade mallar påverkas inte.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setDeleteError(null)
              setDeleteOpen(true)
            }}
          >
            <Trash2 />
            Radera rum
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open)
          if (!open) setDeleteError(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Radera rummet?</DialogTitle>
            <DialogDescription>
              Detta går inte att ångra. Alla filer och chattar i rummet tas bort.
              Publicerade mallar från rummet finns kvar.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="text-sm text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletePending}
              onClick={() => {
                setDeleteError(null)
                setDeletePending(true)
                void removeRoom({ roomId })
                  .then(() => {
                    setDeleteOpen(false)
                    void navigate({ to: "/" })
                  })
                  .catch((err: unknown) => {
                    setDeleteError(
                      err instanceof Error
                        ? err.message
                        : "Kunde inte radera rummet",
                    )
                  })
                  .finally(() => setDeletePending(false))
              }}
            >
              {deletePending ? "Raderar…" : "Radera"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
