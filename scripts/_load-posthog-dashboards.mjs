/**
 * Prints JSON dashboard tile specs for the tile-fix script.
 * Run via: npx tsx scripts/_load-posthog-dashboards.mjs
 */
import activation from "../posthog/dashboards/activation.ts"
import aiSpend from "../posthog/dashboards/ai_spend.ts"
import credits from "../posthog/dashboards/credits.ts"

function summarize(dashboard) {
  return {
    key: dashboard.key,
    name: dashboard.name,
    tiles: dashboard.tiles.map((tile) => {
      if (tile.insight && typeof tile.insight === "object") {
        return {
          kind: "insight",
          insightKey: tile.insight.key,
          layout: tile.layout,
        }
      }
      if (tile.kind === "text" || typeof tile.body === "string") {
        return {
          kind: "text",
          body: tile.body,
          layout: tile.layout,
        }
      }
      return { kind: "unknown", layout: tile.layout }
    }),
  }
}

process.stdout.write(
  JSON.stringify([
    summarize(activation),
    summarize(credits),
    summarize(aiSpend),
  ]),
)
