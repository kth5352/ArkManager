import { useQuery } from '@tanstack/react-query'
import { useLibraries } from './librariesService'
import type { GameEntry } from '../../shared/types/scanner'

export function useGames() {
  const { data: libraries } = useLibraries()
  const libraryPaths = libraries?.map((lib) => lib.path) ?? []

  return useQuery<GameEntry[]>({
    queryKey: ['games', 'scan', libraryPaths],
    queryFn: () => window.api.scanner.scanRecursive(libraryPaths),
    enabled: libraries !== undefined,
  })
}
