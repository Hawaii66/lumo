import { query } from "./_generated/server";

export const status = query({
  args: {},
  handler: async () => {
    return {
      ok: true as const,
      service: "lumo",
    };
  },
});
