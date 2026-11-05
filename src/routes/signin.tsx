import { createFileRoute, Link } from "@tanstack/react-router"
import { Logo } from "~/components/brand/logo"
import { SignInCard } from "~/components/sign-in"

export const Route = createFileRoute("/signin")({
  component: SignInPage,
})

function SignInPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="space-y-1 text-center">
        <Logo asLink size="lg" className="justify-center" />
        <p className="text-sm text-muted-foreground">AI-plugg gjort rätt</p>
      </div>
      <SignInCard mode="signIn" />
      <p className="text-center text-sm">
        <Link
          to="/"
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Tillbaka till startsidan
        </Link>
      </p>
    </main>
  )
}
