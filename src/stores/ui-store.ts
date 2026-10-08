import { create } from "zustand"
import type { HelpLevel } from "~/lib/schemas"

type UiState = {
  helpLevel: HelpLevel
  setHelpLevel: (helpLevel: HelpLevel) => void
  mathDraft: string
  setMathDraft: (mathDraft: string) => void
}

export const useUiStore = create<UiState>((set) => ({
  helpLevel: "explain",
  setHelpLevel: (helpLevel) => set({ helpLevel }),
  mathDraft: "",
  setMathDraft: (mathDraft) => set({ mathDraft }),
}))

export type { HelpLevel }
