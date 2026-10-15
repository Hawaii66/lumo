/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as PDFParse_lumoProblemAgent from "../PDFParse/lumoProblemAgent.js";
import type * as PDFParse_middleJson from "../PDFParse/middleJson.js";
import type * as PDFParse_mineruCache from "../PDFParse/mineruCache.js";
import type * as PDFParse_mineruClient from "../PDFParse/mineruClient.js";
import type * as PDFParse_mineruSchema from "../PDFParse/mineruSchema.js";
import type * as PDFParse_pdfParse from "../PDFParse/pdfParse.js";
import type * as agents_openrouter from "../agents/openrouter.js";
import type * as agents_roomAgent from "../agents/roomAgent.js";
import type * as auth from "../auth.js";
import type * as authProviders_openai from "../authProviders/openai.js";
import type * as authProviders_temp from "../authProviders/temp.js";
import type * as files from "../files.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as lib_lumoContent from "../lib/lumoContent.js";
import type * as lib_roomAuth from "../lib/roomAuth.js";
import type * as lib_roomFiles from "../lib/roomFiles.js";
import type * as rooms from "../rooms.js";
import type * as scanSessions from "../scanSessions.js";
import type * as threads from "../threads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "PDFParse/lumoProblemAgent": typeof PDFParse_lumoProblemAgent;
  "PDFParse/middleJson": typeof PDFParse_middleJson;
  "PDFParse/mineruCache": typeof PDFParse_mineruCache;
  "PDFParse/mineruClient": typeof PDFParse_mineruClient;
  "PDFParse/mineruSchema": typeof PDFParse_mineruSchema;
  "PDFParse/pdfParse": typeof PDFParse_pdfParse;
  "agents/openrouter": typeof agents_openrouter;
  "agents/roomAgent": typeof agents_roomAgent;
  auth: typeof auth;
  "authProviders/openai": typeof authProviders_openai;
  "authProviders/temp": typeof authProviders_temp;
  files: typeof files;
  health: typeof health;
  http: typeof http;
  "lib/lumoContent": typeof lib_lumoContent;
  "lib/roomAuth": typeof lib_roomAuth;
  "lib/roomFiles": typeof lib_roomFiles;
  rooms: typeof rooms;
  scanSessions: typeof scanSessions;
  threads: typeof threads;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
