import type { ScannedEntry } from '../../shared/types/scanner'

// Mirrors electron/main/database/librariesRepository.ts's normalizeLibraryPath
// exactly. Path-keyed favorites are always stored using that normalization
// (lowercased, trailing slash/backslash stripped) before hitting the DB, so
// the raw on-disk path from the live scanner (original casing) must go
// through the same transform before being compared against stored keys.
// normalizeLibraryPath lives in the main process and isn't bundled for the
// renderer, so this is a local copy of its one-line logic — keep them in sync.
function normalizePathKey(path: string): string {
  return path.toLowerCase().replace(/[\\/]+$/, '')
}

export function filterFavorites<T extends Pick<ScannedEntry, 'code' | 'path'>>(
  games: T[],
  favoriteKeys: string[]
): T[] {
  const favoriteKeySet = new Set(favoriteKeys)
  return games.filter((game) =>
    favoriteKeySet.has(game.code?.value ?? normalizePathKey(game.path))
  )
}
