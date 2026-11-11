import { dashboard, hogql, insight, text, trends } from "@posthog/definitions"

const pageviews = insight({
  key: "activation-pageviews",
  name: "Daily pageviews",
  query: trends({
    series: [{ event: "$pageview", math: "dau" }],
    interval: "day",
    dateRange: { date_from: "-30d" },
  }),
})

const signups = insight({
  key: "activation-signups",
  name: "Daily signups",
  query: trends({
    series: [{ event: "user_signed_up", math: "total" }],
    interval: "day",
    dateRange: { date_from: "-30d" },
  }),
})

const roomsCreated = insight({
  key: "activation-rooms",
  name: "Rooms created",
  query: trends({
    series: [
      { event: "room_created", math: "total" },
      { event: "room_cloned", math: "total" },
    ],
    interval: "day",
    dateRange: { date_from: "-30d" },
  }),
})

const messagesSent = insight({
  key: "activation-messages",
  name: "Messages sent",
  query: trends({
    series: [{ event: "message_sent", math: "total" }],
    interval: "day",
    dateRange: { date_from: "-30d" },
  }),
})

// Native funnels() is wrapped as DataTableNode by @posthog/definitions@alpha
// and PostHog rejects that. Use HogQL step counts until Definitions wraps
// FunnelsQuery as InsightVizNode.
const activationSteps = insight({
  key: "activation-funnel",
  name: "Visit → signup → room → message (unique users)",
  description: "Activation step unique users over the last 30 days",
  query: hogql(`
SELECT
  step,
  users
FROM (
  SELECT 1 AS ord, '1. $pageview' AS step, count(DISTINCT distinct_id) AS users
  FROM events
  WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY
  UNION ALL
  SELECT 2, '2. user_signed_up', count(DISTINCT distinct_id)
  FROM events
  WHERE event = 'user_signed_up' AND timestamp >= now() - INTERVAL 30 DAY
  UNION ALL
  SELECT 3, '3. room_created', count(DISTINCT distinct_id)
  FROM events
  WHERE event = 'room_created' AND timestamp >= now() - INTERVAL 30 DAY
  UNION ALL
  SELECT 4, '4. message_sent', count(DISTINCT distinct_id)
  FROM events
  WHERE event = 'message_sent' AND timestamp >= now() - INTERVAL 30 DAY
)
ORDER BY ord
`),
})

const stepCounts = insight({
  key: "activation-step-counts",
  name: "Activation step counts (HogQL)",
  query: hogql(`
SELECT
  event,
  count() AS events,
  count(DISTINCT distinct_id) AS users
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event IN ('$pageview', 'signup_clicked', 'user_signed_up', 'room_created', 'room_cloned', 'message_sent', 'pdf_uploaded', 'pdf_parse_started', 'twin_started')
GROUP BY event
ORDER BY users DESC
`),
})

export default dashboard({
  key: "activation",
  name: "Lumo activation",
  description: "Visit → signup → room → message activation metrics",
  pinned: true,
  tags: ["lumo", "activation"],
  tiles: [
    text({
      body: "## Activation",
      layout: { x: 0, y: 0, w: 12, h: 1 },
    }),
    { insight: activationSteps, layout: { x: 0, y: 1, w: 12, h: 5 } },
    { insight: pageviews, layout: { x: 0, y: 6, w: 3, h: 4 } },
    { insight: signups, layout: { x: 3, y: 6, w: 3, h: 4 } },
    { insight: roomsCreated, layout: { x: 6, y: 6, w: 3, h: 4 } },
    { insight: messagesSent, layout: { x: 9, y: 6, w: 3, h: 4 } },
    { insight: stepCounts, layout: { x: 0, y: 10, w: 12, h: 5 } },
  ],
})
