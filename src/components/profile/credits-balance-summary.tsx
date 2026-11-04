import { useSuspenseQuery } from "@tanstack/react-query"
import { convexQuery } from "@convex-dev/react-query"
import { Link } from "@tanstack/react-router"
import { api } from "../../../convex/_generated/api"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

function formatResetAt(ms: number) {
  return new Date(ms).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm",
    dateStyle: "short",
    timeStyle: "short",
  })
}

function formatResetRelative(ms: number) {
  const diffMs = ms - Date.now()
  if (diffMs <= 0) return "snart"
  const hours = Math.floor(diffMs / (60 * 60 * 1000))
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000))
  if (hours >= 1) {
    return `om ${hours} h ${minutes} min`
  }
  return `om ${minutes} min`
}

export type CreditsBalance = {
  totalAvailable: number
  dailyRemaining: number
  paidBalance: number
  nextResetAt: number
  costs: {
    freeDailyCredits: number
    chatCreditCost: number
    twinCreditCost: number
  }
}

export function useCreditsBalance() {
  return useSuspenseQuery(convexQuery(api.credits.getMyBalance, {}))
}

export function CreditsBalanceCard({
  balance,
  buyCreditsHref = false,
}: {
  balance: CreditsBalance
  /** When true, show a CTA linking to the profile credits tab. */
  buyCreditsHref?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardDescription>Ditt saldo just nu</CardDescription>
        <CardTitle className="text-5xl font-semibold tracking-tight tabular-nums">
          {balance.totalAvailable}
          <span className="text-muted-foreground ml-2 text-lg font-medium tracking-normal">
            credits
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="bg-muted/60 rounded-lg px-3 py-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Dagliga
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {balance.dailyRemaining}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              av {balance.costs.freeDailyCredits} gratis/dag
            </p>
          </div>
          <div className="bg-muted/60 rounded-lg px-3 py-3">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Köpta
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {balance.paidBalance}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              sparas, går inte ut
            </p>
          </div>
          <div className="bg-muted/60 col-span-2 rounded-lg px-3 py-3 sm:col-span-1">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Nästa gratis-reset
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatResetRelative(balance.nextResetAt)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {formatResetAt(balance.nextResetAt)} (Stockholm)
            </p>
          </div>
        </div>
        {buyCreditsHref ? (
          <Button
            size="sm"
            render={<Link to="/profile" search={{ tab: "credits" }} />}
          >
            Köp fler credits
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function CreditsBalanceSummary({
  buyCreditsHref = false,
}: {
  buyCreditsHref?: boolean
}) {
  const { data: balance } = useCreditsBalance()

  if (balance === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credits</CardTitle>
          <CardDescription>
            Credits är inte konfigurerade ännu. Bootstrapa creditConfig från
            startsidan om du är admin.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return <CreditsBalanceCard balance={balance} buyCreditsHref={buyCreditsHref} />
}
