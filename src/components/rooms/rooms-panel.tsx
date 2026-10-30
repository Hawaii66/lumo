import {
  AuthLoading,
  Authenticated,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
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
import { cn } from "~/lib/utils"

const MAX_FIELD_LENGTH = 50

type HomeTab = "rooms" | "templates"

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
        Du har inga rum ännu. Skapa ditt första, eller klona en mall.
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

function formatPublishedAt(timestamp: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
    dateStyle: "medium",
  }).format(new Date(timestamp))
}

function TemplatesBrowser() {
  const navigate = useNavigate()
  const cloneTemplate = useMutation(api.roomTemplates.clone)
  const [query, setQuery] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [cloningId, setCloningId] = useState<Id<"roomTemplates"> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const templates = useQuery(api.roomTemplates.search, { query })

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault()
          setError(null)
          setQuery(searchInput.trim())
        }}
      >
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Sök mallar efter namn…"
          aria-label="Sök rumsmallar"
        />
        <Button type="submit" variant="outline">
          Sök
        </Button>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {templates === undefined ? (
        <p className="text-sm text-muted-foreground">Hämtar mallar…</p>
      ) : templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Inga publicerade mallar hittades.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {templates.map((template) => (
            <li
              key={template._id}
              className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium">{template.name}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {template.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  {template.fileCount} fil
                  {template.fileCount === 1 ? "" : "er"}
                  {template.publisherName
                    ? ` · ${template.publisherName}`
                    : ""}
                  {` · ${formatPublishedAt(template.publishedAt)}`}
                </p>
              </div>
              <Button
                type="button"
                className="shrink-0"
                disabled={cloningId !== null}
                onClick={() => {
                  setError(null)
                  setCloningId(template._id)
                  void cloneTemplate({ templateId: template._id })
                    .then((roomId) => {
                      void navigate({
                        to: "/rooms/$roomId",
                        params: { roomId },
                      })
                    })
                    .catch((err: unknown) => {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Kunde inte klona mallen",
                      )
                    })
                    .finally(() => setCloningId(null))
                }}
              >
                {cloningId === template._id ? "Klonar…" : "Klona"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function RoomsPanel() {
  const [tab, setTab] = useState<HomeTab>("rooms")

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
            <CardTitle>{tab === "rooms" ? "Rum" : "Mallar"}</CardTitle>
            <CardDescription>
              {tab === "rooms"
                ? "Dina rum — öppna eller skapa nytt"
                : "Sök publicerade rumsmallar och klona till ett eget rum"}
            </CardDescription>
            {tab === "rooms" ? (
              <CardAction>
                <CreateRoomDialog />
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="tablist"
              aria-label="Rum och mallar"
              className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted/60 p-0.5"
            >
              {(
                [
                  { id: "rooms", label: "Mina rum" },
                  { id: "templates", label: "Mallar" },
                ] as const
              ).map((item) => {
                const selected = tab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={cn(
                      "rounded-md px-2 py-2 text-sm font-medium transition-colors",
                      selected
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
            {tab === "rooms" ? <RoomsList /> : <TemplatesBrowser />}
          </CardContent>
        </Card>
      </Authenticated>
    </>
  )
}
