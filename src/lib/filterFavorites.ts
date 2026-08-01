import type { ScannedEntry } from '../../shared/types/scanner'
import { normalizeLibraryPath } from '../../shared/normalizeLibraryPath'

export function filterFavorites<T extends Pick<ScannedEntry, 'code' | 'path'>>(
  games: T[],
  favoriteKeys: string[]
): T[] {
  const favoriteKeySet = new Set(favoriteKeys)
  return games.filter((game) =>
    favoriteKeySet.has(game.code?.value ?? normalizeLibraryPath(game.path))
  )
}
