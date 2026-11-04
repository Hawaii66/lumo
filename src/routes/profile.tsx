import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react"
import { CreditCard, Gauge, User } from "lucide-react"
import { Suspense, useState } from "react"
import { api } from "../../convex/_generated/api"
import { AccountCard } from "~/components/profile/account-card"
import { CreditsCard } from "~/components/profile/credits-card"
import { DailySpendCard } from "~/components/profile/daily-spend"
import { RolesAdminCard } from "~/components/profile/roles-admin-card"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { SignInCard } from "~/components/sign-in"

type ProfileTab = "profile" | "credits" | "usage"

type ProfileSearch = {
  topup?: "success" | "canceled"
  tab?: ProfileTab
}

function parseTab(raw: unknown): ProfileTab | undefined {
  if (raw === "profile" || raw === "credits" || raw === "usage") {
    return raw
  }
  return undefined
}

export const Route = createFileRoute("/profile")({
  validateSearch: (search: Record<string, unknown>): ProfileSearch => {
    const topup =
      search.topup === "success" || search.topup === "canceled"
        ? search.topup
        : undefined
    const tab = parseTab(search.tab)
    return {
      ...(topup !== undefined ? { topup } : {}),
      ...(tab !== undefined ? { tab } : {}),
    }
  },
  component: ProfilePage,
})

function AdminRolesSection() {
  const viewer = useQuery(api.users.viewer)
  if (viewer === undefined || viewer === null) {
    return null
  }
  if (viewer.role.key !== "admin") {
    return null
  }
  return <RolesAdminCard />
}

function ProfilePage() {
  const { topup, tab: tabFromSearch } = Route.useSearch()
  const navigate = Route.useNavigate()
  const initialTab: ProfileTab =
    tabFromSearch ?? (topup !== undefined ? "credits" : "profile")
  const [tab, setTab] = useState<ProfileTab>(initialTab)

  function onTabChange(value: string | number | null) {
    if (value !== "profile" && value !== "credits" && value !== "usage") {
      return
    }
    setTab(value)
    void navigate({
      search: (prev) => ({
        ...prev,
        tab: value === "profile" ? undefined : value,
      }),
      replace: true,
    })
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-4xl font-semibold tracking-tight">Profil</h1>
          <p className="text-muted-foreground">
            Konto, credits och daglig förbrukning.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link to="/" />}>
          Startsida
        </Button>
      </div>

      <AuthLoading>
        <Card>
          <CardHeader>
            <CardTitle>Profil</CardTitle>
            <CardDescription>Laddar session…</CardDescription>
          </CardHeader>
        </Card>
      </AuthLoading>

      <Unauthenticated>
        <Card>
          <CardHeader>
            <CardTitle>Logga in</CardTitle>
            <CardDescription>
              Du måste vara inloggad för att se din profil.
            </CardDescription>
          </CardHeader>
        </Card>
        <SignInCard />
      </Unauthenticated>

      <Authenticated>
        <Tabs value={tab} onValueChange={onTabChange}>
          <TabsList
            className="grid h-auto! w-full grid-cols-3 bg-sidebar-accent/40"
            aria-label="Profilsektioner"
          >
            <TabsTrigger
              value="profile"
              className="flex h-auto! flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
            >
              <User className="size-3.5" />
              Profil
            </TabsTrigger>
            <TabsTrigger
              value="credits"
              className="flex h-auto! flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
            >
              <CreditCard className="size-3.5" />
              Credits
            </TabsTrigger>
            <TabsTrigger
              value="usage"
              className="flex h-auto! flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
            >
              <Gauge className="size-3.5" />
              Användning
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6 space-y-6">
            <AccountCard />
            <AdminRolesSection />
          </TabsContent>

          <TabsContent value="credits" className="mt-6">
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
              <CreditsCard topup={topup} />
            </Suspense>
          </TabsContent>

          <TabsContent value="usage" className="mt-6">
            <Suspense
              fallback={
                <Card>
                  <CardHeader>
                    <CardTitle>Användning</CardTitle>
                    <CardDescription>Hämtar förbrukning…</CardDescription>
                  </CardHeader>
                </Card>
              }
            >
              <DailySpendCard />
            </Suspense>
          </TabsContent>
        </Tabs>
      </Authenticated>
    </main>
  )
}
