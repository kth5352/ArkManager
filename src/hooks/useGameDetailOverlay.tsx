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
//
// entries is the host page's current live scan/query result(s). Only the
// opened path is kept in state; the entry itself is re-derived from
// entries on every render, so a mutation elsewhere (e.g. link/unlink
// invalidating the games query) is reflected in the open overlay without
// requiring it to be closed and reopened.
export function useGameDetailOverlay(entries: ScannedEntry[]): {
  openDetail: (entry: ScannedEntry) => void
  detailOverlayElement: JSX.Element
} {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const openDetail = (entry: ScannedEntry): void => {
    setSelectedPath(entry.path)
  }

  const selectedGame = selectedPath
    ? (entries.find((e) => e.path === selectedPath) ?? null)
    : null

  return {
    openDetail,
    detailOverlayElement: (
      <DetailOverlay game={selectedGame} onClose={() => setSelectedPath(null)} />
    ),
  }
}
