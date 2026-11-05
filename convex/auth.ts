import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { MicrosoftAnyAccount } from "./authProviders/microsoft";
import { TempCredentials } from "./authProviders/temp";
// Later (when OpenAI ships SIWC with token usage): import OpenAI SIWC
// provider and add it to `providers`. See ./authProviders/openai.ts.

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [TempCredentials, Google, MicrosoftAnyAccount()],
});
