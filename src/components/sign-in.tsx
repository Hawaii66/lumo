import { useAuthActions } from "@convex-dev/auth/react"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
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

function SignedInCard() {
  const { signOut } = useAuthActions()
  const viewer = useQuery(api.users.viewer)
  const [signingOut, setSigningOut] = useState(false)

  const providerLabel =
    viewer?.providers
      ?.map((p) => {
        if (p.provider === "temp") return "Temp"
        if (p.provider === "openai") return "ChatGPT"
        return p.provider
      })
      .join(", ") || "—"

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
      </CardContent>
    </Card>
  )
}

function SignInForm() {
  const { signIn } = useAuthActions()
  const [email, setEmail] = useState("hawaiilive@outlook.com")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Temp-inloggning</CardTitle>
        <CardDescription>
          Tillfällig credentials-login tills Sign in with ChatGPT är på plats.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            setPending(true)
            void signIn("temp", { email, password })
              .then((result) => {
                if (!result.signingIn) {
                  setError(
                    "Inloggningen gav ingen session. Kontrollera auth-env i Convex.",
                  )
                }
              })
              .catch((err: unknown) => {
                const message =
                  err instanceof Error
                    ? err.message
                    : typeof err === "string"
                      ? err
                      : "Sign-in failed"
                setError(message)
              })
              .finally(() => setPending(false))
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Loggar in…" : "Logga in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function SignInCard() {
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
        <SignInForm />
      </Unauthenticated>
    </>
  )
}
