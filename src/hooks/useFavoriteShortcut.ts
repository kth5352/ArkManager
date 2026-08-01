import { useEffect, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToggleFavorite, userDataQueryKey } from '../services/gameUserDataService'
import type { ScannedEntry } from '../../shared/types/scanner'
import type { GameUserDataDto } from '../../shared/types/ipc'

// Pressing F while hovering a card/row toggles its favorite status, without
// needing to move the mouse onto the small heart icon. This has to be a
// page-level listener (not attached to the row itself) since it must fire
// no matter which element within the hovered row the mouse actually landed
// on - the caller is responsible for tracking which entry is currently
// hovered (see GameCard/GameRow's onMouseEnter/onMouseLeave).
//
// Takes a ref rather than the hovered entry itself - a ref's identity never
// changes, so this effect only re-subscribes when toggleFavorite/queryClient
// actually change, not on every single mouse-move-driven hover change (which
// used to tear down and re-add the window listener at mouse-move frequency).
// The handler reads hoveredEntryRef.current at keydown time instead.
export function useFavoriteShortcut(hoveredEntryRef: RefObject<ScannedEntry | null>): void {
  const queryClient = useQueryClient()
  const toggleFavorite = useToggleFavorite()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'f' || event.ctrlKey || event.altKey) return
      const hoveredEntry = hoveredEntryRef.current
      if (!hoveredEntry) return
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return // 검색창 입력 중엔 무시
      event.preventDefault()
      const cached = queryClient.getQueryData<GameUserDataDto | null>(
        userDataQueryKey(hoveredEntry)
      )
      toggleFavorite.mutate({
        entry: hoveredEntry,
        isFavorite: !(cached?.isFavorite ?? false),
      })
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hoveredEntryRef, toggleFavorite, queryClient])
}
