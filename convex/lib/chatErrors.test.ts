import { describe, expect, it } from "vitest"
import {
  GENERIC_CHAT_ERROR,
  stripConvexWrapper,
  userFacingChatError,
} from "./chatErrors"

describe("userFacingChatError", () => {
  it("maps app insufficient credits", () => {
    expect(
      userFacingChatError(
        "INSUFFICIENT_CREDITS: Du har 0 credits kvar men behöver 1. Toppa upp eller vänta till morgondagens free credits.",
      ),
    ).toBe(
      "Du har 0 credits kvar men behöver 1. Toppa upp eller vänta till morgondagens free credits.",
    )
  })

  it("maps OpenRouter key expiry / 401", () => {
    expect(userFacingChatError("API key expired")).toMatch(/ogiltig|gått ut/i)
    expect(userFacingChatError("User not found.")).toMatch(/ogiltig|gått ut/i)
    expect(
      userFacingChatError("AI_APICallError: Unauthorized status code: 401"),
    ).toMatch(/ogiltig|gått ut/i)
  })

  it("maps OpenRouter credits / 402", () => {
    expect(
      userFacingChatError(
        "Insufficient credits. Add more using https://openrouter.ai/settings/credits",
      ),
    ).toMatch(/slut på credits/i)
    expect(userFacingChatError("Payment Required (402)")).toMatch(
      /slut på credits/i,
    )
  })

  it("maps rate limits", () => {
    expect(userFacingChatError("Rate limit exceeded (429)")).toMatch(
      /för många/i,
    )
  })

  it("falls back for unknown technical errors", () => {
    expect(
      userFacingChatError(
        "AI_APICallError: boom\n    at <anonymous> (node_modules/foo.js:1:1)",
      ),
    ).toBe(GENERIC_CHAT_ERROR)
  })
})

describe("stripConvexWrapper", () => {
  it("strips Convex mutation wrappers", () => {
    expect(
      stripConvexWrapper(
        "[CONVEX M(threads:sendMessage)] [Request ID: abc] Server Error Uncaught Error: INSUFFICIENT_CREDITS: Du har 0 credits kvar men behöver 1.",
      ),
    ).toBe("INSUFFICIENT_CREDITS: Du har 0 credits kvar men behöver 1.")
  })
})
