import { describe, expect, it } from "vitest"
import { chatReplyHasVisibleContent, parseChatReply } from "./chat-reply"

describe("parseChatReply", () => {
  it("returns empty reply for blank input", () => {
    expect(parseChatReply("   ")).toEqual({
      version: 2,
      markdown: "",
      quickReplies: [],
    })
  })

  it("treats non-JSON text as markdown", () => {
    expect(parseChatReply("Hej där")).toEqual({
      version: 2,
      markdown: "Hej där",
      quickReplies: [],
    })
  })

  it("parses a strict version-2 reply", () => {
    const input = JSON.stringify({
      version: 2,
      markdown: "Svar",
      quickReplies: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    })
    expect(parseChatReply(input)).toEqual({
      version: 2,
      markdown: "Svar",
      quickReplies: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    })
  })

  it("falls back to markdown/content and normalizes quick replies", () => {
    expect(
      parseChatReply(
        JSON.stringify({
          content: "via content",
          quickReplies: [
            { id: " 1 ", label: " One " },
            { id: "", label: "skip" },
            null,
            { id: "2", label: "Two" },
            { id: "3", label: "Three" },
            { id: "4", label: "Four" },
            { id: "5", label: "Five" },
          ],
        }),
      ),
    ).toEqual({
      version: 2,
      markdown: "via content",
      quickReplies: [
        { id: "1", label: "One" },
        { id: "2", label: "Two" },
        { id: "3", label: "Three" },
        { id: "4", label: "Four" },
      ],
    })

    expect(
      parseChatReply(
        JSON.stringify({
          markdown: "via markdown",
          quickReplies: "nope",
        }),
      ),
    ).toEqual({
      version: 2,
      markdown: "via markdown",
      quickReplies: [],
    })
  })

  it("returns raw input as markdown for invalid complete JSON objects", () => {
    const raw = '{ "version": 1, "nope": true }'
    expect(parseChatReply(raw)).toEqual({
      version: 2,
      markdown: raw,
      quickReplies: [],
    })
  })

  it("repairs truncated streaming JSON", () => {
    const partial =
      '{"version":2,"markdown":"Delvis","quickReplies":[{"id":"a","label":"A"}],"extra":'
    expect(parseChatReply(partial, { streaming: true })).toEqual({
      version: 2,
      markdown: "Delvis",
      quickReplies: [{ id: "a", label: "A" }],
    })
  })

  it("returns empty markdown while streaming unrecoverable JSON", () => {
    expect(parseChatReply("{", { streaming: true })).toEqual({
      version: 2,
      markdown: "",
      quickReplies: [],
    })
  })

  it("falls back to raw input for unrecoverable non-streaming JSON", () => {
    expect(parseChatReply("{not-json")).toEqual({
      version: 2,
      markdown: "{not-json",
      quickReplies: [],
    })
  })
})

describe("chatReplyHasVisibleContent", () => {
  it("is true when markdown or quick replies are present", () => {
    expect(
      chatReplyHasVisibleContent({
        version: 2,
        markdown: "  x  ",
        quickReplies: [],
      }),
    ).toBe(true)
    expect(
      chatReplyHasVisibleContent({
        version: 2,
        markdown: "   ",
        quickReplies: [{ id: "a", label: "A" }],
      }),
    ).toBe(true)
    expect(
      chatReplyHasVisibleContent({
        version: 2,
        markdown: "  ",
        quickReplies: [],
      }),
    ).toBe(false)
  })
})
