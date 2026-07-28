import { useQuery } from '@tanstack/react-query'
import { useLibraries } from './librariesService'
import type { ScannedEntry } from '../../shared/types/scanner'

export function useGames() {
  const { data: libraries } = useLibraries()
  const libraryPaths = libraries?.map((lib) => lib.path) ?? []

  return useQuery<ScannedEntry[]>({
    queryKey: ['games', 'scan', libraryPaths],
    queryFn: () => window.api.scanner.scanRecursive(libraryPaths),
    enabled: libraries !== undefined,
    // Interim mitigation until a real games cache table lands: without this,
    // React Query's staleTime: 0 default re-runs a full recursive filesystem
    // scan on every Gallery/List mount and every window refocus, which is
    // expensive for a large library.
    staleTime: 5 * 60_000,
  })
}
