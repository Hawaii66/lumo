import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardAction,
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
  DialogTrigger,
} from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"

const MAX_FIELD_LENGTH = 50

function CreateRoomDialog() {
  const createRoom = useMutation(api.rooms.create)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function resetForm() {
    setName("")
    setDescription("")
    setError(null)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) resetForm()
      }}
    >
      <DialogTrigger render={<Button />}>Skapa rum</DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            setPending(true)
            void createRoom({ name, description })
              .then((roomId) => {
                setOpen(false)
                resetForm()
                void navigate({
                  to: "/rooms/$roomId",
                  params: { roomId },
                })
              })
              .catch((err: unknown) => {
                setError(
                  err instanceof Error ? err.message : "Kunde inte skapa rum",
                )
              })
              .finally(() => setPending(false))
          }}
        >
          <DialogHeader>
            <DialogTitle>Nytt rum</DialogTitle>
            <DialogDescription>
              Ge rummet ett namn och en kort beskrivning (max {MAX_FIELD_LENGTH}{" "}
              tecken).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="room-name">Namn</Label>
            <Input
              id="room-name"
              value={name}
              maxLength={MAX_FIELD_LENGTH}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground text-right">
              {name.length}/{MAX_FIELD_LENGTH}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="room-description">Beskrivning</Label>
            <Textarea
              id="room-description"
              value={description}
              maxLength={MAX_FIELD_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="min-h-20"
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/{MAX_FIELD_LENGTH}
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Skapar…" : "Skapa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RoomsList() {
  const rooms = useQuery(api.rooms.list)

  if (rooms === undefined) {
    return <p className="text-sm text-muted-foreground">Hämtar rum…</p>
  }

  if (rooms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Du har inga rum ännu. Skapa ditt första.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {rooms.map((room) => (
        <li key={room._id}>
          <Link
            to="/rooms/$roomId"
            params={{ roomId: room._id }}
            className="flex flex-col gap-0.5 px-3 py-3 transition-colors hover:bg-muted/60"
          >
            <span className="font-medium">{room.name}</span>
            <span className="text-sm text-muted-foreground line-clamp-2">
              {room.description}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function RoomsPanel() {
  return (
    <>
      <AuthLoading>
        <Card>
          <CardHeader>
            <CardTitle>Rum</CardTitle>
            <CardDescription>Laddar…</CardDescription>
          </CardHeader>
        </Card>
      </AuthLoading>
      <Unauthenticated>
        <Card>
          <CardHeader>
            <CardTitle>Rum</CardTitle>
            <CardDescription>Logga in för att skapa och öppna rum.</CardDescription>
          </CardHeader>
        </Card>
      </Unauthenticated>
      <Authenticated>
        <Card>
          <CardHeader>
            <CardTitle>Rum</CardTitle>
            <CardDescription>Dina rum — öppna eller skapa nytt</CardDescription>
            <CardAction>
              <CreateRoomDialog />
            </CardAction>
          </CardHeader>
          <CardContent>
            <RoomsList />
          </CardContent>
        </Card>
      </Authenticated>
    </>
  )
}
