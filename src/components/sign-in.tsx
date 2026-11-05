import { useAuthActions } from "@convex-dev/auth/react"
import { Link } from "@tanstack/react-router"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
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

export type AuthMode = "signIn" | "signUp"

function SignedInCard() {
  const { signOut } = useAuthActions()
  const viewer = useQuery(api.users.viewer)
  const [signingOut, setSigningOut] = useState(false)

  const providerLabel = authProvidersLabel(viewer?.providers)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inloggad</CardTitle>
        <CardDescription>
          {viewer?.email ?? "Hämtar kontouppgifter…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {viewer === undefined ? (
          <p className="text-sm text-muted-foreground">Hämtar användare…</p>
        ) : viewer === null ? (
          <p className="text-sm text-muted-foreground">
            Kunde inte läsa användarprofilen. Prova logga ut och in igen.
          </p>
        ) : (
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Namn</dt>
              <dd className="font-medium text-right">{viewer.name ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">E-post</dt>
              <dd className="font-medium text-right break-all">
                {viewer.email ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Inloggning</dt>
              <dd className="font-medium text-right">{providerLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">User ID</dt>
              <dd className="font-mono text-xs text-right break-all text-muted-foreground">
                {viewer._id}
              </dd>
            </div>
          </dl>
        )}
        <div className="flex flex-wrap gap-2">
          <Button render={<Link to="/dashboard" />}>Dashboard</Button>
          <Button variant="outline" render={<Link to="/profile" />}>
            Profil
          </Button>
          <Button
            variant="outline"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true)
              void signOut().finally(() => setSigningOut(false))
            }}
          >
            {signingOut ? "Loggar ut…" : "Logga ut"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function signInErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return "Sign-in failed"
}

function SignInForm({ mode }: { mode: AuthMode }) {
  const { signIn } = useAuthActions()
  const [email, setEmail] = useState("hawaiilive@outlook.com")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<
    null | "temp" | "google" | "microsoft-entra-id"
  >(null)

  const isSignUp = mode === "signUp"
  const busy = pending !== null

  const startOAuth = (provider: "google" | "microsoft-entra-id") => {
    setError(null)
    setPending(provider)
    void signIn(provider)
      .catch((err: unknown) => {
        setError(signInErrorMessage(err))
        setPending(null)
      })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isSignUp ? "Skapa konto" : "Logga in"}</CardTitle>
        <CardDescription>
          {isSignUp
            ? "Skapa ditt Lumo-konto med Google, Microsoft eller e-post."
            : "Logga in med Google, Microsoft eller e-post."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => startOAuth("google")}
          >
            {pending === "google" ? "Öppnar Google…" : "Fortsätt med Google"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => startOAuth("microsoft-entra-id")}
          >
            {pending === "microsoft-entra-id"
              ? "Öppnar Microsoft…"
              : "Fortsätt med Microsoft"}
          </Button>
        </div>

        <div className="relative flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">eller</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            setPending("temp")
            void signIn("temp", { email, password })
              .then((result) => {
                if (!result.signingIn) {
                  setError(
                    "Inloggningen gav ingen session. Kontrollera auth-env i Convex.",
                  )
                }
              })
              .catch((err: unknown) => {
                setError(signInErrorMessage(err))
              })
              .finally(() => setPending(null))
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Lösenord</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {pending === "temp"
              ? isSignUp
                ? "Skapar konto…"
                : "Loggar in…"
              : isSignUp
                ? "Skapa konto"
                : "Logga in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? (
              <>
                Har du redan ett konto?{" "}
                <Link
                  to="/signin"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Logga in
                </Link>
              </>
            ) : (
              <>
                Ny här?{" "}
                <Link
                  to="/signup"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Skapa konto
                </Link>
              </>
            )}
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

export function SignInCard({ mode = "signIn" }: { mode?: AuthMode }) {
  return (
    <>
      <AuthLoading>
        <Card>
          <CardHeader>
            <CardTitle>Konto</CardTitle>
            <CardDescription>Laddar session…</CardDescription>
          </CardHeader>
        </Card>
      </AuthLoading>
      <Authenticated>
        <SignedInCard />
      </Authenticated>
      <Unauthenticated>
        <SignInForm mode={mode} />
      </Unauthenticated>
    </>
  )
}
