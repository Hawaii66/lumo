import { create } from "zustand"
import type { HelpLevel } from "~/lib/schemas"

type UiState = {
  helpLevel: HelpLevel
  setHelpLevel: (helpLevel: HelpLevel) => void
  mathDraft: string
  setMathDraft: (mathDraft: string) => void
  showFacit: boolean
  setShowFacit: (showFacit: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  helpLevel: "explain",
  setHelpLevel: (helpLevel) => set({ helpLevel }),
  mathDraft: "",
  setMathDraft: (mathDraft) => set({ mathDraft }),
  showFacit: false,
  setShowFacit: (showFacit) => set({ showFacit }),
}))

export type { HelpLevel }
