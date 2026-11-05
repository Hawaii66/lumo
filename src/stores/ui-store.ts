import { create } from "zustand"

type UiState = {
  showFacit: boolean
  setShowFacit: (showFacit: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  showFacit: false,
  setShowFacit: (showFacit) => set({ showFacit }),
}))
