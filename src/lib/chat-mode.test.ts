import { describe, expect, it } from "vitest"
import { buildModeStartPrompt, buildScanStartPrompt } from "./chat-mode"

describe("buildModeStartPrompt", () => {
  it("builds normal and genomgang prompts with mention", () => {
    expect(buildModeStartPrompt("normal", "1.2", "tenta.pdf")).toBe(
      "@1.2-tenta Hjälp mig med den här uppgiften.",
    )
    expect(buildModeStartPrompt("genomgang", "1.2", "tenta.pdf")).toBe(
      "@1.2-tenta Gå igenom uppgiften steg för steg och förklara hur man tänker.",
    )
  })

  it("scopes prompts to a valid subproblem letter", () => {
    expect(buildModeStartPrompt("normal", "1.2", "tenta.pdf", "B")).toBe(
      "@1.2-tenta Hjälp mig med deluppgift (b).",
    )
    expect(buildModeStartPrompt("genomgang", "1.2", "tenta.pdf", "a")).toBe(
      "@1.2-tenta Gå igenom endast deluppgift (a) steg för steg och förklara hur man tänker. Hoppa över övriga deluppgifter.",
    )
  })

  it("ignores invalid letters and omits mention when number/file missing", () => {
    expect(buildModeStartPrompt("normal", "1.2", "tenta.pdf", "ab")).toBe(
      "@1.2-tenta Hjälp mig med den här uppgiften.",
    )
    expect(buildModeStartPrompt("normal", "", "tenta.pdf")).toBe(
      "Hjälp mig med den här uppgiften.",
    )
    expect(buildModeStartPrompt("normal", "1.2", "  ")).toBe(
      "Hjälp mig med den här uppgiften.",
    )
  })
})

describe("buildScanStartPrompt", () => {
  it("builds whole-problem scan prompt with mention", () => {
    expect(buildScanStartPrompt("1.2", "tenta.pdf")).toBe(
      "@1.2-tenta Här är mitt arbete hittills — hjälp mig utifrån det.",
    )
  })

  it("scopes scan prompt to a valid subproblem letter", () => {
    expect(buildScanStartPrompt("1.2", "tenta.pdf", "A")).toBe(
      "@1.2-tenta Här är mitt arbete hittills för deluppgift (a) — hjälp mig utifrån det.",
    )
  })

  it("ignores invalid letters and omits mention when number/file missing", () => {
    expect(buildScanStartPrompt("1.2", "tenta.pdf", "ab")).toBe(
      "@1.2-tenta Här är mitt arbete hittills — hjälp mig utifrån det.",
    )
    expect(buildScanStartPrompt("", "tenta.pdf")).toBe(
      "Här är mitt arbete hittills — hjälp mig utifrån det.",
    )
    expect(buildScanStartPrompt("1.2", "  ")).toBe(
      "Här är mitt arbete hittills — hjälp mig utifrån det.",
    )
  })
})
