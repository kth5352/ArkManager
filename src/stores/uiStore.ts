import { create } from 'zustand'

export type ViewMode = 'gallery' | 'list'

interface UiState {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
}

export const useUiStore = create<UiState>((set) => ({
  viewMode: 'gallery',
  setViewMode: (mode) => set({ viewMode: mode }),
}))
