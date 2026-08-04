import { useGames } from '../services/useGames'
import { useLibraries } from '../services/librariesService'
import { useLibraryVisibilityStore } from '../stores/libraryVisibilityStore'
import { useExcludedEntries } from '../services/excludedEntriesService'
import { findLibraryForPath } from '../lib/findLibraryForPath'
import { isEntryExcluded } from '../lib/isEntryExcluded'
import type { ScannedEntry } from '../../shared/types/scanner'

interface UseVisibleGamesResult {
  data: ScannedEntry[] | undefined
  isLoading: boolean
  isError: boolean
}

// Wraps useGames() with two filters: excluded entries (see
// docs/superpowers/specs/2026-08-03-excluded-entries-design.md - every page
// that calls this hook is affected, currently Gallery/List/DetailList AND
// Favorites; Explorer and the Saves page go through useGames() directly,
// NOT this hook, so they're deliberately unaffected) and the
// library-visibility filter (see libraryVisibilityStore) - an entry that
// doesn't match any registered library (shouldn't normally happen, since
// games only ever come from registered libraries) fails open and stays
// visible rather than being unexpectedly hidden.
export function useVisibleGames(): UseVisibleGamesResult {
  const { data: games, isLoading, isError } = useGames()
  const { data: libraries } = useLibraries()
  const hiddenLibraryIds = useLibraryVisibilityStore((s) => s.hiddenLibraryIds)
  const { data: excludedEntries } = useExcludedEntries()

  const excludedPaths = new Set((excludedEntries ?? []).map((e) => e.path))

  const data =
    games === undefined
      ? games
      : games.filter((entry) => {
          if (isEntryExcluded(entry, excludedPaths)) return false
          if (hiddenLibraryIds.size === 0) return true
          const library = findLibraryForPath(entry.path, libraries ?? [])
          return !library || !hiddenLibraryIds.has(library.id)
        })

  return { data, isLoading, isError }
}
