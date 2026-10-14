import agent from "@convex-dev/agent/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    OPENROUTER_API_KEY: v.optional(v.string()),
  },
});
app.use(agent);

export default app;
