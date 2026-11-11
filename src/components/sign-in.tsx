import { useAuthActions } from "@convex-dev/auth/react"
import { Link, Navigate, useNavigate } from "@tanstack/react-router"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
} from "convex/react"
import { useState } from "react"
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
import { captureSignupClicked } from "~/lib/posthog"

export type AuthMode = "signIn" | "signUp"

const POST_AUTH_REDIRECT = "/dashboard" as const
const showTempPassword = import.meta.env.DEV

function signInErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return "Sign-in failed"
}

function SignInForm({ mode }: { mode: AuthMode }) {
  const { signIn } = useAuthActions()
  const navigate = useNavigate()
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
    void signIn(provider, { redirectTo: POST_AUTH_REDIRECT }).catch(
      (err: unknown) => {
        setError(signInErrorMessage(err))
        setPending(null)
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isSignUp ? "Skapa konto" : "Logga in"}</CardTitle>
        <CardDescription>
          {showTempPassword
            ? isSignUp
              ? "Skapa ditt Lumo-konto med Google, Microsoft eller e-post."
              : "Logga in med Google, Microsoft eller e-post."
            : isSignUp
              ? "Skapa ditt Lumo-konto med Google eller Microsoft."
              : "Logga in med Google eller Microsoft."}
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

        {showTempPassword ? (
          <>
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
                      return
                    }
                    void navigate({ to: POST_AUTH_REDIRECT })
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
                      onClick={captureSignupClicked}
                    >
                      Skapa konto
                    </Link>
                  </>
                )}
              </p>
            </form>
          </>
        ) : (
          <>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
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
                    onClick={captureSignupClicked}
                  >
                    Skapa konto
                  </Link>
                </>
              )}
            </p>
          </>
        )}
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
        <Navigate to={POST_AUTH_REDIRECT} />
      </Authenticated>
      <Unauthenticated>
        <SignInForm mode={mode} />
      </Unauthenticated>
    </>
  )
}
