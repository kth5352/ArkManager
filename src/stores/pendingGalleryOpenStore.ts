import { create } from 'zustand'

interface PendingGalleryOpenState {
  pendingKey: string | null
  setPendingKey: (key: string) => void
  clearPendingKey: () => void
}

// A one-shot cross-page signal (like useSelectionStore/
// useLibraryVisibilityStore) - RecentlyPlayedPage sets this and navigates
// to Gallery; GalleryPage consumes it once its own game list has loaded
// (looking up the matching entry by code or normalized path) and clears it
// immediately after, so it never fires again on a later, unrelated visit.
export const usePendingGalleryOpenStore = create<PendingGalleryOpenState>((set) => ({
  pendingKey: null,
  setPendingKey: (key) => set({ pendingKey: key }),
  clearPendingKey: () => set({ pendingKey: null }),
}))
