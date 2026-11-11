import { useAuthActions } from "@convex-dev/auth/react"
import { useMutation, useQuery } from "convex/react"
import { useEffect, useState } from "react"
import { api } from "../../../convex/_generated/api"
import { ThemeSelector } from "~/components/dashboard/theme-selector"
import { authProvidersLabel } from "~/lib/auth-providers"
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
import { getPostHogClient } from "~/lib/posthog"

function roleLabel(key: "default" | "promoter" | "admin"): string {
  if (key === "promoter") return "Promoter"
  if (key === "admin") return "Admin"
  return "Standard"
}

export function AccountCard() {
  const { signOut } = useAuthActions()
  const viewer = useQuery(api.users.viewer)
  const updateName = useMutation(api.users.updateName)
  const [nameDraft, setNameDraft] = useState("")
  const [saving, setSaving] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (viewer?.name != null) {
      setNameDraft(viewer.name)
    }
  }, [viewer?.name])

  if (viewer === undefined) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Konto</CardTitle>
          <CardDescription>Hämtar kontouppgifter…</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (viewer === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Konto</CardTitle>
          <CardDescription>
            Kunde inte läsa profilen. Prova logga ut och in igen.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const dirty = nameDraft.trim() !== (viewer.name ?? "").trim()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Konto</CardTitle>
        <CardDescription>
          {viewer.email ?? "Ingen e-post kopplad"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            setSavedFlash(false)
            setSaving(true)
            void updateName({ name: nameDraft })
              .then(() => {
                setSavedFlash(true)
              })
              .catch((err: unknown) => {
                setError(
                  err instanceof Error ? err.message : "Kunde inte spara namn",
                )
              })
              .finally(() => setSaving(false))
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="profile-name">Namn</Label>
            <div className="flex gap-2">
              <Input
                id="profile-name"
                name="name"
                value={nameDraft}
                onChange={(e) => {
                  setNameDraft(e.target.value)
                  setSavedFlash(false)
                }}
                maxLength={80}
                autoComplete="name"
              />
              <Button type="submit" disabled={saving || !dirty}>
                {saving ? "Sparar…" : "Spara"}
              </Button>
            </div>
            {savedFlash ? (
              <p className="text-muted-foreground text-xs">Namn sparat.</p>
            ) : null}
            {error ? (
              <p className="text-destructive text-xs">{error}</p>
            ) : null}
          </div>
        </form>

        <ThemeSelector />

        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">E-post</dt>
            <dd className="break-all text-right font-medium">
              {viewer.email ?? "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Inloggning</dt>
            <dd className="text-right font-medium">
              {authProvidersLabel(viewer.providers)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Roll</dt>
            <dd className="text-right font-medium">
              {roleLabel(viewer.role.key)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Free credits / dag</dt>
            <dd className="text-right font-medium">
              {viewer.role.freeDailyCredits}
            </dd>
          </div>
        </dl>

        <Button
          variant="outline"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true)
            getPostHogClient()?.reset()
            void signOut().finally(() => setSigningOut(false))
          }}
        >
          {signingOut ? "Loggar ut…" : "Logga ut"}
        </Button>
      </CardContent>
    </Card>
  )
}
