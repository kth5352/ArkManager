import { useGames } from '../services/useGames'
import { useLibraries } from '../services/librariesService'
import { useLibraryVisibilityStore } from '../stores/libraryVisibilityStore'
import { findLibraryForPath } from '../lib/findLibraryForPath'
import type { ScannedEntry } from '../../shared/types/scanner'

interface UseVisibleGamesResult {
  data: ScannedEntry[] | undefined
  isLoading: boolean
  isError: boolean
}

// Wraps useGames() with the library-visibility filter (see
// libraryVisibilityStore) - an entry that doesn't match any registered
// library (shouldn't normally happen, since games only ever come from
// registered libraries) fails open and stays visible rather than being
// unexpectedly hidden.
export function useVisibleGames(): UseVisibleGamesResult {
  const { data: games, isLoading, isError } = useGames()
  const { data: libraries } = useLibraries()
  const hiddenLibraryIds = useLibraryVisibilityStore((s) => s.hiddenLibraryIds)

  const data =
    games === undefined || hiddenLibraryIds.size === 0
      ? games
      : games.filter((entry) => {
          const library = findLibraryForPath(entry.path, libraries ?? [])
          return !library || !hiddenLibraryIds.has(library.id)
        })

  return { data, isLoading, isError }
}
