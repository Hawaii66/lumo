import { useMutation, useQuery } from "convex/react"
import { UserMinus, UserPlus } from "lucide-react"
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
import { Input } from "~/components/ui/input"
import { Label } from "~/components/ui/label"

export function RoomMembersCard({ roomId }: { roomId: Id<"rooms"> }) {
  const navigate = useNavigate()
  const members = useQuery(api.rooms.listMembers, { roomId })
  const addMemberByEmail = useMutation(api.rooms.addMemberByEmail)
  const removeMember = useMutation(api.rooms.removeMember)

  const [memberEmail, setMemberEmail] = useState("")
  const [memberError, setMemberError] = useState<string | null>(null)
  const [memberPending, setMemberPending] = useState(false)
  const [removingUserId, setRemovingUserId] = useState<Id<"users"> | null>(
    null,
  )

  return (
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
                  disabled={removingUserId !== null || members.length <= 1}
                  onClick={() => {
                    setMemberError(null)
                    setRemovingUserId(member.userId)
                    void removeMember({
                      roomId,
                      userId: member.userId,
                    })
                      .then(() => {
                        if (member.isViewer) {
                          void navigate({ to: "/dashboard" })
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
  )
}
