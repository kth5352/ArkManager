import { useState, type JSX } from 'react'
import { DetailOverlay } from '../components/game/DetailOverlay'
import type { ScannedEntry } from '../../shared/types/scanner'

// Each page (Gallery/List/DetailList/Explorer) calls this locally - no
// global/Zustand state, matching this project's established "search/filter
// state is independent per page" convention. Each page renders
// {detailOverlayElement} once and calls openDetail(entry) from its
// card/row click handler (or, for Explorer's code-less folders, from a
// context-menu action instead of a click - see FolderView.tsx).
//
// detailOverlayElement is a plain JSX element (not a wrapper component
// function declared in here) so that <DetailOverlay> keeps the same
// component type across renders of the host page - wrapping it in a
// function declared inside this hook would create a brand-new component
// type every render, causing React to unmount/remount DetailOverlay (and
// lose all its in-progress dialog state) on every re-render of the host
// page, e.g. a React Query refetch on window refocus.
export function useGameDetailOverlay(): {
  openDetail: (entry: ScannedEntry) => void
  detailOverlayElement: JSX.Element
} {
  const [selectedGame, setSelectedGame] = useState<ScannedEntry | null>(null)

  const openDetail = (entry: ScannedEntry): void => {
    setSelectedGame(entry)
  }

  return {
    openDetail,
    detailOverlayElement: (
      <DetailOverlay game={selectedGame} onClose={() => setSelectedGame(null)} />
    ),
  }
}
