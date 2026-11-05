import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { MicrosoftAnyAccount } from "./authProviders/microsoft";
import { TempCredentials } from "./authProviders/temp";
// Later (when OpenAI ships SIWC with token usage): import OpenAI SIWC
// provider and add it to `providers`. See ./authProviders/openai.ts.

const oauthProviders = [Google, MicrosoftAnyAccount()];

/** Dev-only password provider. Register only when TEMP credentials are set. */
const allowTempAuth =
  Boolean(process.env.TEMP_AUTH_EMAIL?.trim()) &&
  Boolean(process.env.TEMP_AUTH_PASSWORD);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: allowTempAuth
    ? [TempCredentials, ...oauthProviders]
    : oauthProviders,
});
