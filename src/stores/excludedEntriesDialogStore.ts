import { create } from 'zustand'

interface ExcludedEntriesDialogState {
  isOpen: boolean
  open: () => void
  close: () => void
}

// Not persisted - ephemeral dialog-open UI state, same "not a saved
// preference" precedent as libraryVisibilityStore. Lives in a store rather
// than local component state because the dialog is opened from the
// main-process View menu, which has no specific page/component context to
// hold state in.
export const useExcludedEntriesDialogStore = create<ExcludedEntriesDialogState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
