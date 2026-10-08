/**
 * Sign in with ChatGPT (OpenAI) — future provider stub.
 *
 * Website identity flow (when OpenAI provisions your client):
 * https://developers.openai.com/siwc/website
 *
 * Endpoints (from https://auth.openai.com/.well-known/openid-configuration):
 * - authorize: https://auth.openai.com/api/accounts/authorize
 * - token:     https://auth.openai.com/api/accounts/oauth/token
 * - jwks:      https://auth.openai.com/.well-known/jwks.json
 * - issuer:    https://auth.openai.com
 *
 * Scopes for identity: openid profile email
 *
 * Env you will need later:
 * - AUTH_OPENAI_ID (oaiapp_…)
 * - AUTH_OPENAI_SECRET (confidential clients only)
 * - SITE_URL (already set for Convex Auth redirects)
 *
 * Then add a custom Auth.js OAuth provider (or ConvexCredentials that verifies
 * the OpenAI ID token) to convex/auth.ts providers, and map
 * issuer+clientId+sub onto authAccounts / users the same way TempCredentials
 * does today.
 *
 * Do not enable this until OpenAI grants website SIWC access for Lumo.
 */

export const OPENAI_AUTH = {
  id: "openai",
  issuer: "https://auth.openai.com",
  authorizationEndpoint: "https://auth.openai.com/api/accounts/authorize",
  tokenEndpoint: "https://auth.openai.com/api/accounts/oauth/token",
  jwksUri: "https://auth.openai.com/.well-known/jwks.json",
  scopes: ["openid", "profile", "email"] as const,
} as const;
