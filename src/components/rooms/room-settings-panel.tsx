import { useMutation, useQuery } from "convex/react"
import { UserMinus, UserPlus } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"
import { Textarea } from "~/components/ui/textarea"

const MAX_FIELD_LENGTH = 50
const MAX_GENERAL_INFO_LENGTH = 4000

type RoomSettingsPanelProps = {
  roomId: Id<"rooms">
}

export function RoomSettingsPanel({ roomId }: RoomSettingsPanelProps) {
  const navigate = useNavigate()
  const room = useQuery(api.rooms.get, { roomId })
  const members = useQuery(api.rooms.listMembers, { roomId })
  const updateRoom = useMutation(api.rooms.update)
  const addMemberByEmail = useMutation(api.rooms.addMemberByEmail)
  const removeMember = useMutation(api.rooms.removeMember)

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [generalInfo, setGeneralInfo] = useState("")
  const [detailsError, setDetailsError] = useState<string | null>(null)
  const [detailsSaved, setDetailsSaved] = useState(false)
  const [detailsPending, setDetailsPending] = useState(false)
  const [detailsDirty, setDetailsDirty] = useState(false)

  const [memberEmail, setMemberEmail] = useState("")
  const [memberError, setMemberError] = useState<string | null>(null)
  const [memberPending, setMemberPending] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<Id<"users"> | null>(
    null,
  )

  useEffect(() => {
    if (room == null || detailsDirty) return
    setName(room.name)
    setDescription(room.description)
    setGeneralInfo(room.generalInfo)
  }, [room, detailsDirty])

  if (room === undefined) {
    return (
      <p className="text-sm text-muted-foreground">Hämtar inställningar…</p>
    )
  }

  if (room === null) {
    return (
      <p className="text-sm text-muted-foreground">
        Rummet hittades inte eller så saknar du åtkomst.
      </p>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium">Inställningar</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Namn, beskrivning, AI-information och medlemmar för det här rummet.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detaljer</CardTitle>
          <CardDescription>
            Namn och beskrivning (max {MAX_FIELD_LENGTH} tecken). Allmän
            information till AI:n får vara längre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              setDetailsError(null)
              setDetailsSaved(false)
              setDetailsPending(true)
              void updateRoom({
                roomId,
                name,
                description,
                generalInfo,
              })
                .then(() => {
                  setDetailsDirty(false)
                  setDetailsSaved(true)
                })
                .catch((err: unknown) => {
                  setDetailsError(
                    err instanceof Error
                      ? err.message
                      : "Kunde inte spara ändringar",
                  )
                })
                .finally(() => setDetailsPending(false))
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="settings-room-name">Namn</Label>
              <Input
                id="settings-room-name"
                value={name}
                maxLength={MAX_FIELD_LENGTH}
                onChange={(e) => {
                  setName(e.target.value)
                  setDetailsDirty(true)
                  setDetailsSaved(false)
                }}
                required
                className="border-2 border-border bg-background"
              />
              <p className="text-right text-xs text-muted-foreground">
                {name.length}/{MAX_FIELD_LENGTH}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-room-description">Beskrivning</Label>
              <Textarea
                id="settings-room-description"
                value={description}
                maxLength={MAX_FIELD_LENGTH}
                onChange={(e) => {
                  setDescription(e.target.value)
                  setDetailsDirty(true)
                  setDetailsSaved(false)
                }}
                required
                className="min-h-20 border-2 border-border bg-background"
              />
              <p className="text-right text-xs text-muted-foreground">
                {description.length}/{MAX_FIELD_LENGTH}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-room-general-info">
                Allmän beskrivning och information
              </Label>
              <p className="text-sm text-muted-foreground">
                Skriv fritt till AI:n för det här rummet — till exempel vilka
                metoder den ska föredra, kurskontext eller andra instruktioner.
              </p>
              <Textarea
                id="settings-room-general-info"
                value={generalInfo}
                maxLength={MAX_GENERAL_INFO_LENGTH}
                onChange={(e) => {
                  setGeneralInfo(e.target.value)
                  setDetailsDirty(true)
                  setDetailsSaved(false)
                }}
                placeholder="T.ex. Föredra substitutionsmetoden framför partialbråk när det går. Kursen är SF1626…"
                className="min-h-40 border-2 border-border bg-background"
              />
              <p className="text-right text-xs text-muted-foreground">
                {generalInfo.length}/{MAX_GENERAL_INFO_LENGTH}
              </p>
            </div>

            {detailsError ? (
              <p className="text-sm text-destructive">{detailsError}</p>
            ) : null}
            {detailsSaved && !detailsDirty ? (
              <p className="text-sm text-muted-foreground">Sparat.</p>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={detailsPending || !detailsDirty}
              >
                {detailsPending ? "Sparar…" : "Spara"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Medlemmar</CardTitle>
          <CardDescription>
            Lägg till personer som redan har ett Lumo-konto, via e-post.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              setMemberError(null)
              setMemberPending(true)
              void addMemberByEmail({
                roomId,
                email: memberEmail,
              })
                .then(() => setMemberEmail(""))
                .catch((err: unknown) => {
                  setMemberError(
                    err instanceof Error
                      ? err.message
                      : "Kunde inte lägga till medlem",
                  )
                })
                .finally(() => setMemberPending(false))
            }}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="settings-member-email">E-post</Label>
              <Input
                id="settings-member-email"
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="namn@exempel.se"
                required
                className="border-2 border-border bg-background"
              />
            </div>
            <Button type="submit" disabled={memberPending} className="shrink-0">
              <UserPlus />
              {memberPending ? "Lägger till…" : "Lägg till"}
            </Button>
          </form>

          {memberError ? (
            <p className="text-sm text-destructive">{memberError}</p>
          ) : null}

          {members === undefined ? (
            <p className="text-sm text-muted-foreground">Hämtar medlemmar…</p>
          ) : members === null ? (
            <p className="text-sm text-muted-foreground">
              Kunde inte hämta medlemmar.
            </p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga medlemmar.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {member.name ?? member.email ?? "Okänd användare"}
                      {member.isViewer ? (
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          (du)
                        </span>
                      ) : null}
                    </p>
                    {member.email && member.name ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {member.email}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground"
                    aria-label={
                      member.isViewer
                        ? "Lämna rummet"
                        : `Ta bort ${member.name ?? member.email ?? "medlem"}`
                    }
                    disabled={
                      removingUserId !== null || members.length <= 1
                    }
                    onClick={() => {
                      setMemberError(null)
                      setRemovingUserId(member.userId)
                      void removeMember({
                        roomId,
                        userId: member.userId,
                      })
                        .then(() => {
                          if (member.isViewer) {
                            void navigate({ to: "/" })
                          }
                        })
                        .catch((err: unknown) => {
                          setMemberError(
                            err instanceof Error
                              ? err.message
                              : "Kunde inte ta bort medlem",
                          )
                        })
                        .finally(() => setRemovingUserId(null))
                    }}
                  >
                    <UserMinus />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
