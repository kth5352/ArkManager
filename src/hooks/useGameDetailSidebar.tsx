import { type JSX } from 'react'
import { DetailSidebar } from '../components/game/DetailSidebar'
import { useSelectedGameEntry } from './useSelectedGameEntry'
import type { ScannedEntry } from '../../shared/types/scanner'

// Gallery/List/DetailList only - see useGameDetailOverlay for Explorer's
// popup equivalent. Both share useSelectedGameEntry's selection/live-refresh
// logic.
export function useGameDetailSidebar(
  entries: ScannedEntry[],
  onFilterByGenre?: (genre: string) => void
): {
  openDetail: (entry: ScannedEntry) => void
  detailSidebarElement: JSX.Element
} {
  const { selectedGame, openDetail, close } = useSelectedGameEntry(entries)

  return {
    openDetail,
    detailSidebarElement: (
      <DetailSidebar game={selectedGame} onClose={close} onFilterByGenre={onFilterByGenre} />
    ),
  }
}
