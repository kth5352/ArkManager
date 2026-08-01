import { create } from 'zustand'

interface SelectionState {
  selectedPaths: Set<string>
  toggle: (path: string) => void
  selectAll: (paths: string[]) => void
  clear: () => void
}

// Not persisted, shared across Gallery/List/DetailList (like
// useLibraryVisibilityStore) - a per-session working set for bulk rename/
// delete, not a saved preference. Keyed by path rather than by game
// identity since a code-less file has no other stable key.
export const useSelectionStore = create<SelectionState>((set) => ({
  selectedPaths: new Set(),
  toggle: (path) =>
    set((state) => {
      const next = new Set(state.selectedPaths)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { selectedPaths: next }
    }),
  selectAll: (paths) => set({ selectedPaths: new Set(paths) }),
  clear: () => set({ selectedPaths: new Set() }),
}))
