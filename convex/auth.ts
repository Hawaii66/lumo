import { convexAuth } from "@convex-dev/auth/server";
import { TempCredentials } from "./authProviders/temp";
// Future: import OpenAI SIWC provider and add it to `providers`.
// See ./authProviders/openai.ts

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [TempCredentials],
});
