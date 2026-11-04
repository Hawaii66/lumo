import { useMutation, useQuery } from "convex/react"
import { useMemo, useState } from "react"
import { api } from "../../../convex/_generated/api"
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

type RoleKey = "default" | "promoter" | "admin"

const ROLE_LABELS: Record<RoleKey, string> = {
  default: "Standard",
  promoter: "Promoter",
  admin: "Admin",
}

const ROLE_OPTIONS: RoleKey[] = ["default", "promoter", "admin"]

export function RolesAdminCard() {
  const roles = useQuery(api.roles.listRoles)
  const updateRoleCredits = useMutation(api.roles.updateRoleCredits)
  const setUserRole = useMutation(api.roles.setUserRole)

  const [creditDrafts, setCreditDrafts] = useState<
    Partial<Record<RoleKey, string>>
  >({})
  const [savingKey, setSavingKey] = useState<RoleKey | null>(null)
  const [creditError, setCreditError] = useState<string | null>(null)
  const [creditFlash, setCreditFlash] = useState<RoleKey | null>(null)

  const [emailDraft, setEmailDraft] = useState("")
  const [lookupEmail, setLookupEmail] = useState("")
  const foundUser = useQuery(
    api.roles.findUserByEmail,
    lookupEmail.trim().length > 0 ? { email: lookupEmail } : "skip",
  )
  const [assignKey, setAssignKey] = useState<RoleKey>("promoter")
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [assignFlash, setAssignFlash] = useState<string | null>(null)

  const roleByKey = useMemo(() => {
    const map = new Map<RoleKey, number>()
    for (const role of roles ?? []) {
      map.set(role.key, role.freeDailyCredits)
    }
    return map
  }, [roles])

  if (roles === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Roller</CardTitle>
          <CardDescription>Hämtar roller…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Roller</CardTitle>
        <CardDescription>
          Dagliga free credits per roll, och tilldela roll via e-post.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium">Dagliga credits</p>
          {ROLE_OPTIONS.map((key) => {
            const stored = roleByKey.get(key) ?? 0
            const draft = creditDrafts[key] ?? String(stored)
            const dirty = draft.trim() !== String(stored)
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`role-credits-${key}`}>
                  {ROLE_LABELS[key]}
                </Label>
                <div className="flex gap-2">
                  <Input
                    id={`role-credits-${key}`}
                    inputMode="numeric"
                    value={draft}
                    onChange={(e) => {
                      setCreditDrafts((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                      setCreditFlash(null)
                      setCreditError(null)
                    }}
                  />
                  <Button
                    type="button"
                    disabled={savingKey !== null || !dirty}
                    onClick={() => {
                      const parsed = Number.parseInt(draft.trim(), 10)
                      if (!Number.isFinite(parsed) || parsed < 0) {
                        setCreditError("Måste vara ett heltal ≥ 0")
                        return
                      }
                      setSavingKey(key)
                      setCreditError(null)
                      void updateRoleCredits({
                        key,
                        freeDailyCredits: parsed,
                      })
                        .then(() => {
                          setCreditFlash(key)
                          setCreditDrafts((prev) => {
                            const next = { ...prev }
                            delete next[key]
                            return next
                          })
                        })
                        .catch((err: unknown) => {
                          setCreditError(
                            err instanceof Error
                              ? err.message
                              : "Kunde inte spara",
                          )
                        })
                        .finally(() => setSavingKey(null))
                    }}
                  >
                    {savingKey === key ? "Sparar…" : "Spara"}
                  </Button>
                </div>
                {creditFlash === key ? (
                  <p className="text-muted-foreground text-xs">Sparat.</p>
                ) : null}
              </div>
            )
          })}
          {creditError ? (
            <p className="text-destructive text-xs">{creditError}</p>
          ) : null}
        </div>

        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Tilldela roll</p>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              setAssignError(null)
              setAssignFlash(null)
              setLookupEmail(emailDraft.trim())
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="role-user-email">E-post</Label>
              <div className="flex gap-2">
                <Input
                  id="role-user-email"
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="anvandare@exempel.se"
                  autoComplete="off"
                />
                <Button type="submit" variant="outline">
                  Sök
                </Button>
              </div>
            </div>
          </form>

          {lookupEmail.trim().length > 0 && foundUser === undefined ? (
            <p className="text-muted-foreground text-sm">Söker…</p>
          ) : null}
          {lookupEmail.trim().length > 0 && foundUser === null ? (
            <p className="text-muted-foreground text-sm">
              Ingen användare med den e-posten.
            </p>
          ) : null}
          {foundUser ? (
            <div className="space-y-3 rounded-md border p-3">
              <dl className="grid gap-1 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Namn</dt>
                  <dd className="font-medium">{foundUser.name ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">E-post</dt>
                  <dd className="break-all text-right font-medium">
                    {foundUser.email ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Nuvarande roll</dt>
                  <dd className="font-medium">
                    {ROLE_LABELS[foundUser.roleKey]}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="assign-role">Ny roll</Label>
                  <select
                    id="assign-role"
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                    value={assignKey}
                    onChange={(e) => setAssignKey(e.target.value as RoleKey)}
                  >
                    {ROLE_OPTIONS.map((key) => (
                      <option key={key} value={key}>
                        {ROLE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="button"
                  disabled={assigning || assignKey === foundUser.roleKey}
                  onClick={() => {
                    setAssigning(true)
                    setAssignError(null)
                    setAssignFlash(null)
                    void setUserRole({
                      userId: foundUser._id,
                      key: assignKey,
                    })
                      .then(() => {
                        setAssignFlash(
                          `Satte ${ROLE_LABELS[assignKey]} på ${foundUser.email ?? foundUser._id}`,
                        )
                      })
                      .catch((err: unknown) => {
                        setAssignError(
                          err instanceof Error
                            ? err.message
                            : "Kunde inte sätta roll",
                        )
                      })
                      .finally(() => setAssigning(false))
                  }}
                >
                  {assigning ? "Sparar…" : "Tilldela"}
                </Button>
              </div>
              {assignFlash ? (
                <p className="text-muted-foreground text-xs">{assignFlash}</p>
              ) : null}
              {assignError ? (
                <p className="text-destructive text-xs">{assignError}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
