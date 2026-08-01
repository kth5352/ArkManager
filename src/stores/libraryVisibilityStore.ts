import { create } from 'zustand'

interface LibraryVisibilityState {
  hiddenLibraryIds: Set<string>
  toggleLibrary: (id: string) => void
  showAll: () => void
}

// Not persisted (like zoom/search query, unlike sort preferences/sidebar
// width) - a lightweight per-session display filter, not a saved
// preference. Shared across Gallery/List/DetailList via this store rather
// than per-page local state, since "which libraries are showing" is one
// concept the user expects to carry across pages, not reset when switching
// views.
export const useLibraryVisibilityStore = create<LibraryVisibilityState>((set) => ({
  hiddenLibraryIds: new Set(),
  toggleLibrary: (id) =>
    set((state) => {
      const next = new Set(state.hiddenLibraryIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { hiddenLibraryIds: next }
    }),
  showAll: () => set({ hiddenLibraryIds: new Set() }),
}))
