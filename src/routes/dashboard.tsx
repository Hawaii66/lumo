import { Outlet, createFileRoute, Link } from "@tanstack/react-router"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
} from "convex/react"
import { DashboardThemeShell } from "~/components/dashboard/dashboard-theme-shell"
import { SignInCard } from "~/components/sign-in"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <>
      <AuthLoading>
        <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
          <Card>
            <CardHeader>
              <CardTitle>Dashboard</CardTitle>
              <CardDescription>Laddar session…</CardDescription>
            </CardHeader>
          </Card>
        </main>
      </AuthLoading>

      <Unauthenticated>
        <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-tight">
                Dashboard
              </h1>
              <p className="text-muted-foreground">
                Du måste vara inloggad för att se din översikt.
              </p>
            </div>
            <Button variant="outline" size="sm" render={<Link to="/" />}>
              Startsida
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Logga in</CardTitle>
              <CardDescription>
                Logga in för att se credits, rum och mallar.
              </CardDescription>
            </CardHeader>
          </Card>
          <SignInCard />
        </main>
      </Unauthenticated>

      <Authenticated>
        <DashboardThemeShell>
          <Outlet />
        </DashboardThemeShell>
      </Authenticated>
    </>
  )
}
