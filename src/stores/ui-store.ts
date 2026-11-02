import { create } from "zustand"

type UiState = {
  mathDraft: string
  setMathDraft: (mathDraft: string) => void
  showFacit: boolean
  setShowFacit: (showFacit: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  mathDraft: "",
  setMathDraft: (mathDraft) => set({ mathDraft }),
  showFacit: false,
  setShowFacit: (showFacit) => set({ showFacit }),
}))
