import type { GameWithSavePathDto } from '../../../shared/types/ipc'

export function filterSaveGamesBySnapshotCounts(
  games: GameWithSavePathDto[],
  snapshotCounts: Map<string, number>
): GameWithSavePathDto[] {
  return games.filter((game) => (snapshotCounts.get(game.key) ?? 1) > 0)
}
