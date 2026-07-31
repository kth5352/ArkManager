import { useState } from 'react'
import type { ScannedEntry } from '../../shared/types/scanner'

// Shared by useGameDetailOverlay (Explorer's popup) and useGameDetailSidebar
// (Gallery/List/DetailList's panel) - only the opened path is kept in state,
// the entry itself is re-derived from `entries` on every render, so a
// mutation elsewhere (e.g. link/unlink invalidating the games query) is
// reflected in whichever UI has it open without requiring it to be closed
// and reopened.
export function useSelectedGameEntry(entries: ScannedEntry[]): {
  selectedGame: ScannedEntry | null
  openDetail: (entry: ScannedEntry) => void
  close: () => void
} {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const openDetail = (entry: ScannedEntry): void => {
    setSelectedPath(entry.path)
  }

  const close = (): void => {
    setSelectedPath(null)
  }

  const selectedGame = selectedPath ? (entries.find((e) => e.path === selectedPath) ?? null) : null

  // A controlled Dialog's onOpenChange only fires on user-initiated closes
  // (Escape/outside click/close button), not when `open` flips to false
  // because selectedGame itself went null (e.g. the entry left `entries`
  // after an unlink). Adjusting selectedPath here during render - rather
  // than in an effect - is React's documented pattern for this
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes):
  // it terminates after one extra render because the next pass has
  // selectedPath already null, so the condition can't hold twice. Without
  // this, selectedPath would stay pointing at the now-absent path, and
  // whichever UI has it open could silently reopen later if that same path
  // reappears in `entries` without a fresh openDetail() call.
  if (selectedPath && !selectedGame) {
    setSelectedPath(null)
  }

  return { selectedGame, openDetail, close }
}
