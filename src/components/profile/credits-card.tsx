import { useSuspenseQuery } from "@tanstack/react-query"
import { convexQuery } from "@convex-dev/react-query"
import { useAction } from "convex/react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import {
  CreditsBalanceCard,
  useCreditsBalance,
} from "~/components/profile/credits-balance-summary"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

type TopupStatus = "success" | "canceled" | undefined

export function CreditsCard({ topup }: { topup: TopupStatus }) {
  const { data: balance } = useCreditsBalance()
  const { data: deals } = useSuspenseQuery(
    convexQuery(api.creditDeals.listActiveDeals, {}),
  )
  const createCheckout = useAction(api.billing.createDealCheckout)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function buyDeal(dealId: (typeof deals)[number]["_id"]) {
    setBusy(`deal-${dealId}`)
    setActionError(null)
    try {
      const { url } = await createCheckout({ dealId })
      if (!url) {
        throw new Error("Stripe returnerade ingen checkout-URL")
      }
      window.location.assign(url)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Något gick fel")
      setBusy(null)
    }
  }

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

  return (
    <div className="space-y-6">
      {topup === "success" ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          Köpet lyckades — credits läggs till inom några sekunder.
        </p>
      ) : null}
      {topup === "canceled" ? (
        <p className="text-muted-foreground rounded-md border px-3 py-2 text-sm">
          Köpet avbröts. Inga credits debiterades.
        </p>
      ) : null}

      <CreditsBalanceCard balance={balance} />

      <section className="space-y-3 py-8">
        <div>
          <h2 className="text-lg font-medium">Köp credits</h2>
          <p className="text-muted-foreground text-sm">
            Köpta credits läggs till ditt betalda saldo och sparas.
          </p>
        </div>

        {deals.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Inga paket tillgängliga just nu.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((deal) => {
              const isBusy = busy === `deal-${deal._id}`
              return (
                <li
                  key={deal._id}
                  className="flex flex-col gap-3 rounded-2xl border-2 border-primary bg-background p-4 text-foreground"
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <p className="text-lg font-semibold tracking-tight text-foreground">
                      {deal.name}
                    </p>
                    <p className="text-sm font-medium text-foreground">
                      +{deal.creditsGranted} credits
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {deal.description}
                    </p>
                    <p className="mt-auto pt-2 text-xl font-semibold tabular-nums text-foreground">
                      {deal.priceSek} kr
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="default"
                    disabled={busy !== null}
                    onClick={() => void buyDeal(deal._id)}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 h-11 w-full rounded-xl text-base font-semibold"
                  >
                    {isBusy
                      ? "Öppnar checkout…"
                      : `Köp ${deal.creditsGranted} credits`}
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        {actionError !== null ? (
          <p className="text-destructive text-sm">{actionError}</p>
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Vad kostar credits?</h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <li className="bg-muted/60 rounded-xl px-4 py-4">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Chattmeddelande
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {balance.costs.chatCreditCost}
              <span className="text-muted-foreground ml-1 text-sm font-medium">
                credits
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Debiteras när du skickar ett chattmeddelande.
            </p>
          </li>
          <li className="bg-muted/60 rounded-xl px-4 py-4">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Tvillingproblem
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {balance.costs.twinCreditCost}
              <span className="text-muted-foreground ml-1 text-sm font-medium">
                credits
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Debiteras när du genererar ett tvillingproblem. Återbetalas om
              genereringen misslyckas.
            </p>
          </li>
          <li className="bg-muted/60 rounded-xl px-4 py-4">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Gratis varje dag
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {balance.costs.freeDailyCredits}
              <span className="text-muted-foreground ml-1 text-sm font-medium">
                credits
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              Fylls på vid midnatt (Stockholm). Oanvända dagliga credits sparas
              inte.
            </p>
          </li>
        </ul>
        <p className="text-muted-foreground text-xs">
          Dagliga credits används först. Köpta credits sparas och går inte ut.
        </p>
      </section>
    </div>
  )
}
