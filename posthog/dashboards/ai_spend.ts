import { dashboard, hogql, insight, text, trends } from "@posthog/definitions"

const productAiCost = insight({
  key: "ai-product-cost",
  name: "Billable AI cost (ai_usage)",
  description: "USD from llmUsage-aligned product events (chat + twin)",
  query: trends({
    series: [
      {
        event: "ai_usage",
        math: "sum",
        math_property: "costUsd",
      },
    ],
    interval: "day",
    dateRange: { date_from: "-30d" },
    breakdownFilter: { breakdown: "chargeSource", breakdown_type: "event" },
  }),
})

const generationCost = insight({
  key: "ai-generation-cost",
  name: "LLM generation cost ($ai_generation)",
  description: "OpenTelemetry AI Observability cost across all agents",
  query: trends({
    series: [
      {
        event: "$ai_generation",
        math: "sum",
        math_property: "$ai_total_cost_usd",
      },
    ],
    interval: "day",
    dateRange: { date_from: "-30d" },
    breakdownFilter: { breakdown: "$ai_model", breakdown_type: "event" },
  }),
})

const generationLatency = insight({
  key: "ai-generation-latency",
  name: "Avg LLM latency",
  query: trends({
    series: [
      {
        event: "$ai_generation",
        math: "avg",
        math_property: "$ai_latency",
      },
    ],
    interval: "day",
    dateRange: { date_from: "-30d" },
  }),
})

const generationCount = insight({
  key: "ai-generation-count",
  name: "LLM generations",
  query: trends({
    series: [{ event: "$ai_generation", math: "total" }],
    interval: "day",
    dateRange: { date_from: "-30d" },
  }),
})

const costPerUser = insight({
  key: "ai-cost-per-user",
  name: "AI cost per user (30d)",
  query: hogql(`
SELECT
  distinct_id,
  sum(toFloat(properties.$ai_total_cost_usd)) AS cost_usd,
  count() AS generations
FROM events
WHERE event = '$ai_generation'
  AND timestamp >= now() - INTERVAL 30 DAY
GROUP BY distinct_id
ORDER BY cost_usd DESC
LIMIT 25
`),
})

const dailyUsd = insight({
  key: "ai-daily-usd",
  name: "Daily AI USD (product + generations)",
  query: hogql(`
SELECT
  toDate(timestamp) AS day,
  sumIf(toFloat(properties.costUsd), event = 'ai_usage') AS product_usd,
  sumIf(toFloat(properties.$ai_total_cost_usd), event = '$ai_generation') AS generation_usd
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND event IN ('ai_usage', '$ai_generation')
GROUP BY day
ORDER BY day
`),
})

export default dashboard({
  key: "ai_spend",
  name: "Lumo AI spend",
  description: "Product ai_usage cost plus $ai_generation observability traces",
  pinned: true,
  tags: ["lumo", "ai"],
  tiles: [
    text({
      body: "## AI spend",
      layout: { x: 0, y: 0, w: 12, h: 1 },
    }),
    { insight: productAiCost, layout: { x: 0, y: 1, w: 6, h: 5 } },
    { insight: generationCost, layout: { x: 6, y: 1, w: 6, h: 5 } },
    { insight: generationLatency, layout: { x: 0, y: 6, w: 6, h: 4 } },
    { insight: generationCount, layout: { x: 6, y: 6, w: 6, h: 4 } },
    { insight: costPerUser, layout: { x: 0, y: 10, w: 6, h: 5 } },
    { insight: dailyUsd, layout: { x: 6, y: 10, w: 6, h: 5 } },
  ],
})
