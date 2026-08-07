import { create } from 'zustand'

interface PendingGalleryOpenState {
  pendingKey: string | null
  pendingSearchQuery: string | null
  setPendingKey: (key: string) => void
  setPendingSearchQuery: (query: string) => void
  clearPendingKey: () => void
  clearPendingSearchQuery: () => void
}

// A one-shot cross-page signal (like useSelectionStore/
// useLibraryVisibilityStore) - RecentlyPlayedPage sets this and navigates
// to Gallery; GalleryPage consumes it once its own game list has loaded
// (looking up the matching entry by code or normalized path) and clears it
// immediately after, so it never fires again on a later, unrelated visit.
export const usePendingGalleryOpenStore = create<PendingGalleryOpenState>((set) => ({
  pendingKey: null,
  pendingSearchQuery: null,
  setPendingKey: (key) => set({ pendingKey: key }),
  setPendingSearchQuery: (query) => set({ pendingSearchQuery: query }),
  clearPendingKey: () => set({ pendingKey: null }),
  clearPendingSearchQuery: () => set({ pendingSearchQuery: null }),
}))
