import { createFileRoute, Link } from "@tanstack/react-router"
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react"
import { CreditCard, FileSearch, Gauge, Shield, User } from "lucide-react"
import { Suspense, useEffect, useState } from "react"
import { api } from "../../convex/_generated/api"
import { DashboardThemeShell } from "~/components/dashboard/dashboard-theme-shell"
import { AccountCard } from "~/components/profile/account-card"
import { CreditConfigAdminCard } from "~/components/profile/credit-config-admin-card"
import { CreditDealsAdminCard } from "~/components/profile/credit-deals-admin-card"
import { CreditsCard } from "~/components/profile/credits-card"
import { DailySpendCard } from "~/components/profile/daily-spend"
import { ProblemListModeCard } from "~/components/profile/problem-list-mode-card"
import { RolesAdminCard } from "~/components/profile/roles-admin-card"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { SignInCard } from "~/components/sign-in"

type ProfileTab = "profile" | "credits" | "usage" | "admin"

type ProfileSearch = {
  topup?: "success" | "canceled"
  tab?: ProfileTab
}

function parseTab(raw: unknown): ProfileTab | undefined {
  if (
    raw === "profile" ||
    raw === "credits" ||
    raw === "usage" ||
    raw === "admin"
  ) {
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

function useIsAdmin() {
  const viewer = useQuery(api.users.viewer)
  if (viewer === undefined) return undefined
  if (viewer === null) return false
  return viewer.role.key === "admin"
}

function ProfilePage() {
  const { topup, tab: tabFromSearch } = Route.useSearch()
  const navigate = Route.useNavigate()
  const isAdmin = useIsAdmin()
  const initialTab: ProfileTab =
    tabFromSearch ?? (topup !== undefined ? "credits" : "profile")
  const [tab, setTab] = useState<ProfileTab>(initialTab)

  useEffect(() => {
    if (isAdmin === false && tab === "admin") {
      setTab("profile")
      void navigate({
        search: (prev) => {
          const { tab: _removed, ...rest } = prev
          return rest
        },
        replace: true,
      })
    }
  }, [isAdmin, tab, navigate])

  function onTabChange(value: string | number | null) {
    if (
      value !== "profile" &&
      value !== "credits" &&
      value !== "usage" &&
      value !== "admin"
    ) {
      return
    }
    if (value === "admin" && isAdmin !== true) {
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

  const tabCount = isAdmin === true ? 4 : 3

  return (
    <DashboardThemeShell>
      <main className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-8 p-6 sm:p-8">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <Link
              to="/dashboard"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              ← Tillbaka
            </Link>
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Profil</h1>
          <p className="text-muted-foreground">
            Konto, credits och daglig förbrukning.
          </p>
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
              className={`grid h-auto! w-full bg-sidebar-accent/40 ${
                tabCount === 4 ? "grid-cols-4" : "grid-cols-3"
              }`}
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
              {isAdmin === true ? (
                <TabsTrigger
                  value="admin"
                  className="flex h-auto! flex-col gap-0.5 py-1.5 text-[10px] font-medium tracking-wide uppercase data-active:bg-sidebar-primary data-active:text-sidebar-primary-foreground data-active:shadow-sm"
                >
                  <Shield className="size-3.5" />
                  Admin
                </TabsTrigger>
              ) : null}
            </TabsList>

            <TabsContent value="profile" className="mt-6 space-y-6">
              <AccountCard />
              <ProblemListModeCard />
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

            {isAdmin === true ? (
              <TabsContent value="admin" className="mt-6 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileSearch className="size-5" />
                      PDF-tolkning
                    </CardTitle>
                    <CardDescription>
                      Ladda upp PDF:er, följ MinerU/AI-status och testa
                      tolkning utan att spara till databasen.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      render={<Link to="/admin/pdf-parse" />}
                    >
                      Öppna labb
                    </Button>
                  </CardContent>
                </Card>
                <RolesAdminCard />
                <CreditConfigAdminCard />
                <CreditDealsAdminCard />
              </TabsContent>
            ) : null}
          </Tabs>
        </Authenticated>
      </main>
    </DashboardThemeShell>
  )
}
