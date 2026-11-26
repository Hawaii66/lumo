import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  env,
  httpAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { ensureMiddleJson } from "./getOrFetchMiddleJson";
import { detectProblemChunks, sampleBlockLeads } from "./middleJson";
import { middleJsonSchema } from "./mineruSchema";
import type { ProblemNumberFormat } from "./problemNumberFormat";
import {
  normalizeChunkForFixture,
  suggestFixtureName,
} from "./splitFixture";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function unauthorized(): Response {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

function serviceUnavailable(message: string): Response {
  return jsonResponse({ error: message }, 503);
}

function badRequest(message: string): Response {
  return jsonResponse({ error: message }, 400);
}

/** Validate Bearer FIXTURE_ADMIN_KEY. Returns an error Response or null if OK. */
function requireFixtureAdminKey(req: Request): Response | null {
  const configured = env.FIXTURE_ADMIN_KEY;
  if (configured === undefined || configured.trim().length === 0) {
    return serviceUnavailable(
      "FIXTURE_ADMIN_KEY saknas — sätt med npx convex env set FIXTURE_ADMIN_KEY …",
    );
  }
  const header = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${configured}`;
  if (header !== expected) {
    return unauthorized();
  }
  return null;
}

/** Prefer an admin user for the format agent; fall back to any user. */
export const getFixtureAgentUserId = internalQuery({
  args: {},
  returns: v.union(v.id("users"), v.null()),
  handler: async (ctx) => {
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_key", (q) => q.eq("key", "admin"))
      .unique();
    if (adminRole !== null) {
      const adminUser = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("roleId", adminRole._id))
        .first();
      if (adminUser !== null) {
        return adminUser._id;
      }
    }
    const anyUser = await ctx.db.query("users").first();
    return anyUser?._id ?? null;
  },
});

export const registerUploadedPdf = internalMutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
  },
  returns: v.object({
    contentHash: v.string(),
    name: v.string(),
  }),
  handler: async (ctx, args) => {
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (metadata === null) {
      throw new Error("PDF-filen hittades inte i lagringen");
    }
    const contentType = (metadata.contentType ?? "").toLowerCase();
    if (
      contentType !== "application/pdf" &&
      contentType !== "application/octet-stream" &&
      !args.name.toLowerCase().endsWith(".pdf")
    ) {
      throw new Error("Endast PDF-filer är tillåtna");
    }
    return {
      contentHash: metadata.sha256,
      name: args.name,
    };
  },
});

export const isMineruCacheReady = internalQuery({
  args: { contentHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("mineruCache")
      .withIndex("by_contentHash", (q) =>
        q.eq("contentHash", args.contentHash),
      )
      .first();
    return row !== null;
  },
});

/** POST /fixtures/split/upload-url → { uploadUrl } */
export const fixtureUploadUrl = httpAction(async (ctx, req) => {
  const authError = requireFixtureAdminKey(req);
  if (authError !== null) {
    return authError;
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const uploadUrl = await ctx.storage.generateUploadUrl();
  return jsonResponse({ uploadUrl });
});

/**
 * POST /fixtures/split/start
 * body: { storageId, name }
 * → { contentHash, name, status: "ready" | "pending" }
 */
export const fixtureStart = httpAction(async (ctx, req) => {
  const authError = requireFixtureAdminKey(req);
  if (authError !== null) {
    return authError;
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Ogiltig JSON");
  }
  if (typeof body !== "object" || body === null) {
    return badRequest("Ogiltig body");
  }
  const record = body as Record<string, unknown>;
  const storageIdRaw = record.storageId;
  const nameRaw = record.name;
  if (typeof storageIdRaw !== "string" || storageIdRaw.length === 0) {
    return badRequest("storageId krävs");
  }
  if (typeof nameRaw !== "string" || nameRaw.trim().length === 0) {
    return badRequest("name krävs");
  }

  const storageId = storageIdRaw as Id<"_storage">;
  let registered: { contentHash: string; name: string };
  try {
    registered = await ctx.runMutation(
      internal.PDFParse.fixtureHttp.registerUploadedPdf,
      { storageId, name: nameRaw.trim() },
    );
  } catch (err: unknown) {
    return badRequest(err instanceof Error ? err.message : "Register misslyckades");
  }

  const ensured = await ensureMiddleJson(
    ctx,
    registered.contentHash,
    storageId,
    undefined,
  );

  return jsonResponse({
    contentHash: registered.contentHash,
    name: registered.name,
    status: ensured.status === "ready" ? "ready" : "pending",
  });
});

/** GET /fixtures/split/status?contentHash= → { ready: boolean } */
export const fixtureStatus = httpAction(async (ctx, req) => {
  const authError = requireFixtureAdminKey(req);
  if (authError !== null) {
    return authError;
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const url = new URL(req.url);
  const contentHash = url.searchParams.get("contentHash");
  if (contentHash === null || contentHash.length === 0) {
    return badRequest("contentHash krävs");
  }
  const ready: boolean = await ctx.runQuery(
    internal.PDFParse.fixtureHttp.isMineruCacheReady,
    { contentHash },
  );
  return jsonResponse({ ready });
});

/**
 * GET /fixtures/split/export?contentHash=&name=
 * → { suggestedName, middle, format, expected }
 */
export const fixtureExport = httpAction(async (ctx, req) => {
  const authError = requireFixtureAdminKey(req);
  if (authError !== null) {
    return authError;
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const url = new URL(req.url);
  const contentHash = url.searchParams.get("contentHash");
  const nameParam = url.searchParams.get("name") ?? "split-fixture";
  if (contentHash === null || contentHash.length === 0) {
    return badRequest("contentHash krävs");
  }

  const ready: boolean = await ctx.runQuery(
    internal.PDFParse.fixtureHttp.isMineruCacheReady,
    { contentHash },
  );
  if (!ready) {
    return jsonResponse({ error: "MinerU-cache inte redo", ready: false }, 409);
  }

  const cached: {
    middleJsonStorageId: Id<"_storage">;
  } | null = await ctx.runQuery(
    internal.PDFParse.mineruCache.getByContentHash,
    { contentHash },
  );
  if (cached === null) {
    return jsonResponse({ error: "MinerU-cache saknas" }, 404);
  }

  const blob = await ctx.storage.get(cached.middleJsonStorageId);
  if (blob === null) {
    return jsonResponse({ error: "MinerU middle_json saknas" }, 500);
  }
  const parsed = middleJsonSchema.safeParse(JSON.parse(await blob.text()));
  if (!parsed.success) {
    return jsonResponse({ error: "MinerU middle_json korrupt" }, 500);
  }

  const userId: Id<"users"> | null = await ctx.runQuery(
    internal.PDFParse.fixtureHttp.getFixtureAgentUserId,
    {},
  );
  if (userId === null) {
    return jsonResponse(
      {
        error:
          "Ingen användare i databasen — skapa/logga in en admin först så format-agenten har en userId",
      },
      500,
    );
  }

  const format: ProblemNumberFormat = await ctx.runAction(
    internal.PDFParse.lumoFormatAgent.detectProblemNumberFormat,
    { userId, leads: sampleBlockLeads(parsed.data) },
  );
  const expected = detectProblemChunks(parsed.data, format).map(
    normalizeChunkForFixture,
  );

  return jsonResponse({
    suggestedName: suggestFixtureName(nameParam),
    middle: parsed.data,
    format,
    expected,
  });
});
