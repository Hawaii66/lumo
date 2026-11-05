import { useSuspenseQuery } from "@tanstack/react-query"
import { convexQuery } from "@convex-dev/react-query"
import { api } from "../../../convex/_generated/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"

function formatDayLabel(date: string) {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("sv-SE", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function DailySpendCard() {
  const { data } = useSuspenseQuery(
    convexQuery(api.credits.myDailySpend, { days: 14 }),
  )

  if (data === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Användning</CardTitle>
          <CardDescription>Logga in för att se förbrukning.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const maxNet = Math.max(1, ...data.days.map((d) => d.netSpent))
  const today = data.days[data.days.length - 1]?.date

  return (
    <Card>
      <CardHeader>
        <CardTitle>Användning</CardTitle>
        <CardDescription>
          Credits använda senaste 14 dagarna. Idag:{" "}
          {data.todayNetSpent} credits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 text-sm">
          <p className="font-medium">Perioden</p>
          <dl className="text-muted-foreground grid gap-1">
            <div className="flex justify-between gap-4">
              <dt className="flex items-center gap-2">
                <span
                  className="bg-sidebar-primary size-2.5 shrink-0 rounded-sm"
                  aria-hidden
                />
                Chatt
              </dt>
              <dd className="tabular-nums font-medium text-foreground">
                {data.totals.chatSpent}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="flex items-center gap-2">
                <span
                  className="bg-secondary size-2.5 shrink-0 rounded-sm"
                  aria-hidden
                />
                Tvilling
              </dt>
              <dd className="tabular-nums font-medium text-foreground">
                {data.totals.twinSpent}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-1">
              <dt>Totalt använt</dt>
              <dd className="tabular-nums font-medium text-foreground">
                {data.totals.netSpent}
              </dd>
            </div>
            {data.totals.purchased > 0 ? (
              <div className="flex justify-between gap-4">
                <dt>Köpt</dt>
                <dd className="tabular-nums font-medium text-foreground">
                  +{data.totals.purchased}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <ul className="space-y-3">
          {[...data.days].reverse().map((day) => {
            const isToday = day.date === today
            const chatPct = Math.round((day.chatSpent / maxNet) * 100)
            const twinPct = Math.round((day.twinSpent / maxNet) * 100)
            const hasActivity =
              day.netSpent > 0 || day.purchases.length > 0

            return (
              <li key={day.date} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span
                    className={
                      isToday ? "font-medium" : "text-muted-foreground"
                    }
                  >
                    {formatDayLabel(day.date)}
                    {isToday ? " (idag)" : ""}
                  </span>
                  <span className="tabular-nums font-medium">
                    {day.netSpent}
                  </span>
                </div>
                <div className="bg-muted flex h-2 overflow-hidden rounded-sm">
                  {day.chatSpent > 0 ? (
                    <div
                      className="bg-sidebar-primary h-full"
                      style={{ width: `${chatPct}%` }}
                      title={`Chatt: ${day.chatSpent}`}
                    />
                  ) : null}
                  {day.twinSpent > 0 ? (
                    <div
                      className="bg-secondary h-full"
                      style={{ width: `${twinPct}%` }}
                      title={`Tvilling: ${day.twinSpent}`}
                    />
                  ) : null}
                </div>
                {hasActivity ? (
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                    {day.chatSpent > 0 ? (
                      <span>Chatt {day.chatSpent}</span>
                    ) : null}
                    {day.twinSpent > 0 ? (
                      <span>Tvilling {day.twinSpent}</span>
                    ) : null}
                    {day.purchases.map((purchase, i) => (
                      <span
                        key={`${day.date}-buy-${i}`}
                        className="text-foreground"
                      >
                        Köpte {purchase.label}
                        {purchase.priceSek !== null
                          ? ` (${purchase.priceSek} kr)`
                          : ""}{" "}
                        · +{purchase.credits}
                      </span>
                    ))}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
