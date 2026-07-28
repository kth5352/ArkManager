import { useGames } from '../../services/useGames'
import { useFavoriteKeys } from '../../services/gameUserDataService'
import { Skeleton } from '../../components/ui/skeleton'

export function FavoritesPage() {
  const { data: games, isLoading: gamesLoading } = useGames()
  const { data: favoriteKeys, isLoading: keysLoading } = useFavoriteKeys()

  if (gamesLoading || keysLoading || !games || !favoriteKeys) {
    return (
      <div className="grid grid-cols-5 gap-4 p-6">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    )
  }

  const favoriteKeySet = new Set(favoriteKeys)
  const favorites = games.filter((game) => favoriteKeySet.has(game.code?.value ?? game.path))

  if (favorites.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        즐겨찾기한 게임이 없습니다.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-5 gap-4 p-6">
      {favorites.map((game) => (
        <div key={game.path} className="aspect-[3/4] rounded-md border border-border bg-card p-2">
          <p className="truncate text-sm font-medium">{game.name}</p>
        </div>
      ))}
    </div>
  )
}
