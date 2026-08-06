import { create } from 'zustand'

export interface LastMove {
  path: string
  newPath: string
}

interface LastMoveState {
  lastMove: LastMove[] | null
  setLastMove: (moves: LastMove[]) => void
  clearLastMove: () => void
}

// Not persisted (like selectionStore) - a per-session record of the single
// most recent successful move, not a saved preference. Holds only one level
// of undo, per design - setLastMove unconditionally replaces whatever was
// recorded before, including when the "move" is itself an undo (which is
// exactly what makes pressing Ctrl+Z twice undo-the-undo/redo, for free).
export const useLastMoveStore = create<LastMoveState>((set) => ({
  lastMove: null,
  setLastMove: (moves) => set({ lastMove: moves }),
  clearLastMove: () => set({ lastMove: null }),
}))
