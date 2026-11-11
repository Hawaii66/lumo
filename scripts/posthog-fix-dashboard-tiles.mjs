/**
 * Workaround for https://github.com/PostHog/posthog-definitions/issues/13
 * PostHog silently drops insight tiles on dashboard create/PATCH.
 * Link insights via PATCH /insights/:id { dashboards: [...] }, then
 * PATCH layouts onto the resulting tiles.
 */
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const envPath = join(root, ".env.local")

if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

if (process.env.POSTHOG_DEFINITIONS_HOST) {
  process.env.POSTHOG_HOST = process.env.POSTHOG_DEFINITIONS_HOST.replace(
    /\/$/,
    "",
  )
} else if (process.env.POSTHOG_HOST?.includes(".i.posthog.com")) {
  process.env.POSTHOG_HOST = process.env.POSTHOG_HOST.replace(
    ".i.posthog.com",
    ".posthog.com",
  )
}

const host = (process.env.POSTHOG_HOST ?? "https://us.posthog.com").replace(
  /\/$/,
  "",
)
const projectId = process.env.POSTHOG_PROJECT_ID
const apiKey = process.env.POSTHOG_PERSONAL_API_KEY

if (!apiKey || !projectId) {
  console.error(
    "POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID are required to fix dashboard tiles.",
  )
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
}

async function api(method, path, body) {
  const res = await fetch(`${host}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(
      `${method} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 500)}`,
    )
  }
  return json
}

async function listPaged(resourcePath) {
  const results = []
  let next = `${resourcePath}?limit=100`
  while (next) {
    const page = await api("GET", next)
    results.push(...(page.results ?? []))
    next = page.next
      ? new URL(page.next).pathname + new URL(page.next).search
      : null
  }
  return results
}

function layoutsFor(layout) {
  return { sm: layout, lg: layout }
}

async function loadDashboardSpecs() {
  const tsx = join(root, "node_modules/tsx/dist/cli.mjs")
  const loader = join(root, "scripts/_load-posthog-dashboards.mjs")
  const child = spawn(process.execPath, [tsx, loader], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "inherit"],
  })
  let stdout = ""
  for await (const chunk of child.stdout) stdout += chunk
  const code = await new Promise((resolve) => child.on("exit", resolve))
  if (code !== 0) {
    throw new Error(`Failed to load dashboard specs (exit ${code})`)
  }
  return JSON.parse(stdout)
}

const specs = await loadDashboardSpecs()
const insights = await listPaged(`/api/projects/${projectId}/insights/`)
const dashboards = await listPaged(`/api/projects/${projectId}/dashboards/`)

const insightIdByKey = new Map()
for (const insight of insights) {
  const tag = (insight.tags ?? []).find((t) =>
    String(t).startsWith("iac:insights:"),
  )
  if (tag) {
    insightIdByKey.set(String(tag).slice("iac:insights:".length), insight.id)
  }
}

const dashboardIdByKey = new Map()
for (const dash of dashboards) {
  const tag = (dash.tags ?? []).find((t) =>
    String(t).startsWith("iac:dashboards:"),
  )
  if (tag) {
    dashboardIdByKey.set(
      String(tag).slice("iac:dashboards:".length),
      dash.id,
    )
  }
}

for (const spec of specs) {
  const dashboardId = dashboardIdByKey.get(spec.key)
  if (dashboardId === undefined) {
    console.warn(`skip dashboard "${spec.key}": not found in PostHog`)
    continue
  }

  const insightTiles = spec.tiles.filter((t) => t.kind === "insight")
  for (const tile of insightTiles) {
    const insightId = insightIdByKey.get(tile.insightKey)
    if (insightId === undefined) {
      console.warn(
        `skip insight "${tile.insightKey}" on "${spec.key}": not found`,
      )
      continue
    }
    await api("PATCH", `/api/projects/${projectId}/insights/${insightId}/`, {
      dashboards: [dashboardId],
    })
  }

  const live = await api(
    "GET",
    `/api/projects/${projectId}/dashboards/${dashboardId}/`,
  )
  const tileIdByInsightId = new Map()
  for (const tile of live.tiles ?? []) {
    if (tile.insight?.id != null) {
      tileIdByInsightId.set(tile.insight.id, tile.id)
    }
  }

  const patchTiles = []
  for (const tile of spec.tiles) {
    if (tile.kind === "text") {
      const existing = (live.tiles ?? []).find(
        (t) => t.text?.body === tile.body,
      )
      patchTiles.push({
        ...(existing?.id !== undefined ? { id: existing.id } : {}),
        text: { body: tile.body },
        layouts: layoutsFor(tile.layout),
      })
      continue
    }
    if (tile.kind === "insight") {
      const insightId = insightIdByKey.get(tile.insightKey)
      if (insightId === undefined) continue
      const tileId = tileIdByInsightId.get(insightId)
      if (tileId === undefined) {
        console.warn(
          `no tile id yet for insight "${tile.insightKey}" on "${spec.key}"`,
        )
        continue
      }
      patchTiles.push({
        id: tileId,
        insight: insightId,
        layouts: layoutsFor(tile.layout),
      })
    }
  }

  await api("PATCH", `/api/projects/${projectId}/dashboards/${dashboardId}/`, {
    delete_insights: false,
    tiles: patchTiles,
  })

  const verify = await api(
    "GET",
    `/api/projects/${projectId}/dashboards/${dashboardId}/`,
  )
  console.log(
    `${spec.name}: ${(verify.tiles ?? []).length} tiles (expected ${spec.tiles.length})`,
  )
}
