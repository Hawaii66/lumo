import { describe, expect, it } from "vitest"
import {
  deletionExpiryTriggerLabel,
  formatSidebarTimeLeft,
} from "./chat-deletion-expiry"

const NOW = 1_700_000_000_000

describe("formatSidebarTimeLeft", () => {
  it("returns snart when expired or due", () => {
    expect(formatSidebarTimeLeft(NOW, NOW)).toBe("snart")
    expect(formatSidebarTimeLeft(NOW - 1, NOW)).toBe("snart")
  })

  it("formats minutes-only remaining time", () => {
    expect(formatSidebarTimeLeft(NOW + 90_000, NOW)).toBe("2m kvar")
  })

  it("formats hours with and without leftover minutes", () => {
    expect(formatSidebarTimeLeft(NOW + 3_600_000, NOW)).toBe("1h kvar")
    expect(formatSidebarTimeLeft(NOW + 3_600_000 + 120_000, NOW)).toBe(
      "1h 2m kvar",
    )
  })
})

describe("deletionExpiryTriggerLabel", () => {
  it("uses Aldrig for infinite or missing deleteAt", () => {
    expect(deletionExpiryTriggerLabel("infinite", NOW + 1000, NOW)).toBe(
      "Aldrig",
    )
    expect(deletionExpiryTriggerLabel("1h", null, NOW)).toBe("Aldrig")
    expect(deletionExpiryTriggerLabel("1h", undefined, NOW)).toBe("Aldrig")
  })

  it("uses countdown wording for timed chats", () => {
    expect(deletionExpiryTriggerLabel("1h", NOW, NOW)).toBe("snart")
    expect(deletionExpiryTriggerLabel("3h", NOW + 90_000, NOW)).toBe("om 2m")
    expect(
      deletionExpiryTriggerLabel("3h", NOW + 3_600_000 + 60_000, NOW),
    ).toBe("om 1t 1m")
  })
})
