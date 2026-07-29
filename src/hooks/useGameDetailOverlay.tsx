import { useState, type JSX } from 'react'
import { DetailOverlay } from '../components/game/DetailOverlay'
import type { ScannedEntry } from '../../shared/types/scanner'

// Each page (Gallery/List/DetailList/Explorer) calls this locally - no
// global/Zustand state, matching this project's established "search/filter
// state is independent per page" convention. Each page renders
// <DetailOverlayElement /> once and calls openDetail(entry) from its
// card/row click handler (or, for Explorer's code-less folders, from a
// context-menu action instead of a click - see FolderView.tsx).
export function useGameDetailOverlay(): {
  openDetail: (entry: ScannedEntry) => void
  DetailOverlayElement: () => JSX.Element
} {
  const [selectedGame, setSelectedGame] = useState<ScannedEntry | null>(null)

  const openDetail = (entry: ScannedEntry): void => {
    setSelectedGame(entry)
  }

  function DetailOverlayElement(): JSX.Element {
    return <DetailOverlay game={selectedGame} onClose={() => setSelectedGame(null)} />
  }

  return { openDetail, DetailOverlayElement }
}
