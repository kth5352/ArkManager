import type { ScannedEntry } from '../../shared/types/scanner'
import { isArchiveFile } from '../../shared/isArchiveFile'
import { normalizeLibraryPath } from '../../shared/normalizeLibraryPath'

type FavoriteEntry = Pick<ScannedEntry, 'code' | 'path' | 'kind' | 'mtimeMs' | 'name'>

function scoreEntry(entry: Pick<ScannedEntry, 'kind' | 'name' | 'mtimeMs'>): [number, number, number] {
  const folderScore = entry.kind === 'folder' ? 1 : 0
  const archiveScore = entry.kind === 'file' && isArchiveFile(entry.name) ? 1 : 0
  return [folderScore, archiveScore, entry.mtimeMs]
}

function isBetterRepresentative<T extends FavoriteEntry>(candidate: T, current: T): boolean {
  const candidateScore = scoreEntry(candidate)
  const currentScore = scoreEntry(current)
  for (let i = 0; i < candidateScore.length; i += 1) {
    if (candidateScore[i] !== currentScore[i]) return candidateScore[i] > currentScore[i]
  }
  return normalizeLibraryPath(candidate.path) < normalizeLibraryPath(current.path)
}

export function filterFavorites<T extends FavoriteEntry>(
  games: T[],
  favoriteKeys: string[]
): T[] {
  const favoriteKeySet = new Set(favoriteKeys)
  const byCode = new Map<string, T>()
  const pathFavorites: T[] = []

  for (const game of games) {
    if (game.code) {
      if (!favoriteKeySet.has(game.code.value)) continue
      const current = byCode.get(game.code.value)
      if (!current || isBetterRepresentative(game, current)) byCode.set(game.code.value, game)
    } else if (favoriteKeySet.has(normalizeLibraryPath(game.path))) {
      pathFavorites.push(game)
    }
  }

  return [...byCode.values(), ...pathFavorites]
}
