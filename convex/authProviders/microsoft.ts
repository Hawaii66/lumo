import type { OAuthConfig, OAuthUserConfig } from "@auth/core/providers/oauth";

type MicrosoftGraphProfile = {
  id: string;
  displayName?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
};

/**
 * Sign in with Microsoft for any account (work, school, or personal).
 *
 * Uses the /common authority. Convex Auth's default OIDC path rejects
 * tenant-specific ID-token issuers from that endpoint, so this provider:
 * - runs as OAuth (not OIDC discovery)
 * - strips `id_token` from the token response
 * - loads the profile from Microsoft Graph `/me`
 *
 * Entra app registration must allow:
 * "Accounts in any organizational directory and personal Microsoft accounts"
 *
 * Env:
 * - AUTH_MICROSOFT_ENTRA_ID_ID
 * - AUTH_MICROSOFT_ENTRA_ID_SECRET
 */
export function MicrosoftAnyAccount(
  config: OAuthUserConfig<MicrosoftGraphProfile> = {},
): OAuthConfig<MicrosoftGraphProfile> {
  return {
    id: "microsoft-entra-id",
    name: "Microsoft",
    type: "oauth",
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    authorization: {
      url: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
      params: {
        scope: "openid profile email User.Read",
        response_type: "code",
      },
    },
    token: {
      url: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      async conform(response: Response) {
        const data = (await response.json()) as Record<string, unknown>;
        // Drop id_token so oauth4webapi skips iss validation against /common.
        delete data.id_token;
        return Response.json(data, {
          status: response.status,
          statusText: response.statusText,
        });
      },
    },
    userinfo: {
      url: "https://graph.microsoft.com/v1.0/me",
      async request({
        tokens,
      }: {
        tokens: { access_token?: string };
      }) {
        const response = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (!response.ok) {
          throw new Error(
            `Microsoft Graph /me failed: ${response.status} ${response.statusText}`,
          );
        }
        return (await response.json()) as MicrosoftGraphProfile;
      },
    },
    profile(profile) {
      const email = profile.mail ?? profile.userPrincipalName ?? undefined;
      // Omit `image` — users.image is v.optional(v.string()), so null fails schema.
      return {
        id: profile.id,
        name: profile.displayName ?? email ?? undefined,
        email,
      };
    },
    // PKCE + Entra has caused empty callback body errors for some setups.
    checks: ["state"],
    style: { text: "#fff", bg: "#0072c6" },
    options: config,
  } as OAuthConfig<MicrosoftGraphProfile>;
}
