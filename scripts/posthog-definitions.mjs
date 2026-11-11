/**
 * Run posthog-definitions with vars from `.env.local` when present.
 * Existing process.env wins (so CI/prod deploy can inject lumo-prod keys).
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

// Definitions talks to the PostHog *app* API, not the ingestion host.
// Prefer POSTHOG_DEFINITIONS_HOST; otherwise rewrite eu.i.posthog.com → eu.posthog.com.
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

const cli = join(
  root,
  "node_modules/@posthog/definitions/dist/cli/index.js",
)
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
})
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
