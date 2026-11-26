#!/usr/bin/env node
/**
 * Batch-generate dry-run split fixtures for every PDF under pdfs/.
 * Requires `npm run dev` (convex dev) and:
 *   - FIXTURE_ADMIN_KEY in Convex env + .env.local
 *   - CONVEX_SITE_URL or VITE_CONVEX_URL in .env.local
 *   - At least one user in the DB (for format agent userId)
 *
 * Usage:
 *   npm run fixtures:generate-split
 *   npm run fixtures:generate-split -- tenta-250326-envar-tata41.pdf
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
const pdfsDir = join(root, "pdfs");
const fixturesRoot = join(root, "convex/PDFParse/__fixtures__");

const POLL_MS = 5_000;
const MAX_WAIT_MS = 30 * 60 * 1000;

function loadEnvLocal() {
  if (!existsSync(envPath)) {
    return;
  }
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

function siteUrl() {
  const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
  if (site) {
    return site;
  }
  const cloud =
    process.env.VITE_CONVEX_URL?.replace(/\/$/, "") ||
    process.env.CONVEX_URL?.replace(/\/$/, "");
  if (cloud) {
    return cloud.replace(/\.cloud$/, ".site");
  }
  throw new Error(
    "Set CONVEX_SITE_URL or VITE_CONVEX_URL in .env.local (convex.dev site URL)",
  );
}

function adminKey() {
  const key = process.env.FIXTURE_ADMIN_KEY?.trim();
  if (!key) {
    throw new Error(
      "Set FIXTURE_ADMIN_KEY in .env.local (same value as npx convex env set FIXTURE_ADMIN_KEY)",
    );
  }
  return key;
}

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${adminKey()}`,
    ...extra,
  };
}

async function apiJson(path, options = {}) {
  const base = siteUrl();
  const res = await fetch(`${base}${path}`, options);
  const text = await res.text();
  let body;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON from ${path}: ${res.status} ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && body !== null && "error" in body
        ? String(body.error)
        : text;
    throw new Error(`${path} → ${res.status}: ${message}`);
  }
  return body;
}

async function uploadPdf(filePath) {
  const { uploadUrl } = await apiJson("/fixtures/split/upload-url", {
    method: "POST",
    headers: authHeaders(),
  });
  if (typeof uploadUrl !== "string") {
    throw new Error("upload-url saknade uploadUrl");
  }

  const bytes = readFileSync(filePath);
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/pdf" },
    body: bytes,
  });
  if (!res.ok) {
    throw new Error(`Storage upload failed: ${res.status} ${await res.text()}`);
  }
  const { storageId } = await res.json();
  if (typeof storageId !== "string") {
    throw new Error("Storage upload saknade storageId");
  }
  return storageId;
}

async function waitUntilReady(contentHash) {
  const started = Date.now();
  for (;;) {
    const { ready } = await apiJson(
      `/fixtures/split/status?contentHash=${encodeURIComponent(contentHash)}`,
      { headers: authHeaders() },
    );
    if (ready === true) {
      return;
    }
    if (Date.now() - started > MAX_WAIT_MS) {
      throw new Error(`Timeout waiting for MinerU (${contentHash})`);
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

function writeFixture(suggestedName, bundle) {
  const dir = join(fixturesRoot, suggestedName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "middle.json"),
    `${JSON.stringify(bundle.middle, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, "format.json"),
    `${JSON.stringify(bundle.format, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, "expected.json"),
    `${JSON.stringify(bundle.expected, null, 2)}\n`,
  );
  return dir;
}

async function processPdf(filePath) {
  const name = basename(filePath);
  console.log(`\n=== ${name} ===`);
  console.log("Uploading…");
  const storageId = await uploadPdf(filePath);

  console.log("Starting MinerU…");
  const started = await apiJson("/fixtures/split/start", {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ storageId, name }),
  });

  if (started.status !== "ready") {
    process.stdout.write("Waiting for MinerU");
    await waitUntilReady(started.contentHash);
    process.stdout.write("\n");
  } else {
    console.log("MinerU cache hit");
  }

  console.log("Exporting format + split…");
  const bundle = await apiJson(
    `/fixtures/split/export?contentHash=${encodeURIComponent(started.contentHash)}&name=${encodeURIComponent(name)}`,
    { headers: authHeaders() },
  );

  const dir = writeFixture(bundle.suggestedName, bundle);
  console.log(
    `Wrote ${dir} (${Array.isArray(bundle.expected) ? bundle.expected.length : "?"} problems)`,
  );
}

async function main() {
  const filter = process.argv[2];
  if (!existsSync(pdfsDir)) {
    throw new Error(`Missing pdfs/ directory at ${pdfsDir}`);
  }

  // Touch config early for clear errors
  siteUrl();
  adminKey();

  let files = readdirSync(pdfsDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  if (filter) {
    files = files.filter(
      (f) => f === filter || f === `${filter}.pdf` || f.includes(filter),
    );
    if (files.length === 0) {
      throw new Error(`No PDF in pdfs/ matching ${filter}`);
    }
  }
  if (files.length === 0) {
    throw new Error("No PDFs in pdfs/");
  }

  console.log(`Site: ${siteUrl()}`);
  console.log(`PDFs: ${files.length}`);

  for (const file of files) {
    await processPdf(join(pdfsDir, file));
  }
  console.log("\nDone. Run: npm test -- convex/PDFParse/problemSplit.dry.test.ts");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
