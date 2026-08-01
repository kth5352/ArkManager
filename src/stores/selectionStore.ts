import { create } from 'zustand'

interface SelectionState {
  isActive: boolean
  selectedPaths: Set<string>
  // Enters selection mode - checkboxes are hidden until this has been
  // called (via the toolbar's "선택" button or a long-press on a card/row).
  // An initialPath pre-selects the item that was long-pressed, so the
  // gesture that turns on selection mode also selects its own target.
  activate: (initialPath?: string) => void
  // Exits selection mode entirely (the toolbar's "취소" button) - unlike
  // clear(), this also hides the checkboxes again.
  deactivate: () => void
  toggle: (path: string) => void
  selectAll: (paths: string[]) => void
  clear: () => void
}

// Not persisted, shared across Gallery/List/DetailList (like
// useLibraryVisibilityStore) - a per-session working set for bulk rename/
// delete, not a saved preference. Keyed by path rather than by game
// identity since a code-less file has no other stable key.
export const useSelectionStore = create<SelectionState>((set) => ({
  isActive: false,
  selectedPaths: new Set(),
  activate: (initialPath) =>
    set((state) => ({
      isActive: true,
      selectedPaths: initialPath
        ? new Set(state.selectedPaths).add(initialPath)
        : state.selectedPaths,
    })),
  deactivate: () => set({ isActive: false, selectedPaths: new Set() }),
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
