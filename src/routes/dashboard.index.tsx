import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { Suspense } from "react"
import { api } from "../../convex/_generated/api"
import { ThemeSelector } from "~/components/dashboard/theme-selector"
import { useHejPhrase } from "~/components/marketing/hej-phrase"
import { CreditsBalanceSummary } from "~/components/profile/credits-balance-summary"
import { RoomsPanel } from "~/components/rooms/rooms-panel"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndexPage,
})

function DashboardIndexPage() {
  const viewer = useQuery(api.users.viewer)
  const hej = useHejPhrase()
  const displayName = viewer?.name?.trim() || viewer?.email || "there"

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {hej} {displayName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ThemeSelector />
          <Button variant="outline" size="sm" render={<Link to="/pdf" />}>
            PDF-verktyg
          </Button>
          <Button variant="outline" size="sm" render={<Link to="/profile" />}>
            Profil
          </Button>
          <Button variant="outline" size="sm" render={<Link to="/" />}>
            Startsida
          </Button>
        </div>
      </div>

      <Suspense
        fallback={
          <Card>
            <CardHeader>
              <CardTitle>Credits</CardTitle>
              <CardDescription>Hämtar saldo…</CardDescription>
            </CardHeader>
          </Card>
        }
      >
        <CreditsBalanceSummary buyCreditsHref />
      </Suspense>

      <RoomsPanel />
    </main>
  )
}
