import { describe, expect, it } from "vitest"
import { ConvexError } from "convex/values"
import { INSUFFICIENT_CREDITS_CODE } from "../../convex/lib/credits"
import { formatUserFacingError } from "./user-facing-error"

describe("formatUserFacingError", () => {
  it("reads ConvexError insufficient-credits payload", () => {
    expect(
      formatUserFacingError(
        new ConvexError({
          code: INSUFFICIENT_CREDITS_CODE,
          message: "Du har 0 credits kvar men behöver 1. Toppa upp.",
        }),
      ),
    ).toBe("Du har 0 credits kvar men behöver 1. Toppa upp.")
  })

  it("unwraps Convex mutation Error wrappers", () => {
    expect(
      formatUserFacingError(
        new Error(
          "[CONVEX M(threads:sendMessage)] [Request ID: abc] Server Error Uncaught Error: INSUFFICIENT_CREDITS: Du har 0 credits kvar men behöver 1.",
        ),
      ),
    ).toBe("Du har 0 credits kvar men behöver 1.")
  })

  it("maps OpenRouter key expiry text", () => {
    expect(formatUserFacingError(new Error("API key expired"))).toMatch(
      /ogiltig|gått ut/i,
    )
  })
})
