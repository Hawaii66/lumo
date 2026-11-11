import { dashboard, hogql, insight, text, trends } from "@posthog/definitions"

const creditsSpent = insight({
  key: "credits-spent",
  name: "Credits spent",
  query: trends({
    series: [
      {
        event: "credit_spent",
        math: "sum",
        math_property: "amount",
      },
    ],
    interval: "day",
    dateRange: { date_from: "-30d" },
    breakdownFilter: { breakdown: "kind", breakdown_type: "event" },
  }),
})

const creditsGranted = insight({
  key: "credits-granted",
  name: "Credits granted",
  query: trends({
    series: [
      {
        event: "credit_granted",
        math: "sum",
        math_property: "amount",
      },
    ],
    interval: "day",
    dateRange: { date_from: "-30d" },
    breakdownFilter: { breakdown: "kind", breakdown_type: "event" },
  }),
})

const checkouts = insight({
  key: "credits-checkouts",
  name: "Checkout started",
  query: trends({
    series: [{ event: "checkout_started", math: "total" }],
    interval: "day",
    dateRange: { date_from: "-30d" },
  }),
})

const refunds = insight({
  key: "credits-refunds",
  name: "Credits refunded",
  query: trends({
    series: [
      {
        event: "credit_refunded",
        math: "sum",
        math_property: "amount",
      },
    ],
    interval: "day",
    dateRange: { date_from: "-30d" },
  }),
})

const topSpenders = insight({
  key: "credits-top-spenders",
  name: "Top credit spenders (30d)",
  query: hogql(`
SELECT
  distinct_id,
  sum(toFloat(properties.amount)) AS credits_spent
FROM events
WHERE event = 'credit_spent'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY distinct_id
ORDER BY credits_spent DESC
LIMIT 25
`),
})

export default dashboard({
  key: "credits",
  name: "Lumo credits",
  description: "Credit spend, grants, purchases and refunds",
  pinned: true,
  tags: ["lumo", "credits"],
  tiles: [
    text({
      body: "## Credits",
      layout: { x: 0, y: 0, w: 12, h: 1 },
    }),
    { insight: creditsSpent, layout: { x: 0, y: 1, w: 6, h: 5 } },
    { insight: creditsGranted, layout: { x: 6, y: 1, w: 6, h: 5 } },
    { insight: checkouts, layout: { x: 0, y: 6, w: 6, h: 4 } },
    { insight: refunds, layout: { x: 6, y: 6, w: 6, h: 4 } },
    { insight: topSpenders, layout: { x: 0, y: 10, w: 12, h: 5 } },
  ],
})
