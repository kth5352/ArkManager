import { type JSX } from 'react'
import { DetailOverlay } from '../components/game/DetailOverlay'
import { useSelectedGameEntry } from './useSelectedGameEntry'
import type { ScannedEntry } from '../../shared/types/scanner'

// Explorer-only (see FolderView.tsx) - Gallery/List/DetailList use
// useGameDetailSidebar instead, sharing the same selection/live-refresh
// logic via useSelectedGameEntry.
export function useGameDetailOverlay(entries: ScannedEntry[]): {
  openDetail: (entry: ScannedEntry) => void
  detailOverlayElement: JSX.Element
} {
  const { selectedGame, openDetail, close } = useSelectedGameEntry(entries)

  return {
    openDetail,
    detailOverlayElement: <DetailOverlay game={selectedGame} onClose={close} />,
  }
}
