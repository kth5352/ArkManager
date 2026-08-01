import { useGames } from '../../services/useGames'
import { useFavoriteKeys } from '../../services/gameUserDataService'
import { Skeleton } from '../../components/ui/skeleton'
import { filterFavorites } from '../../lib/filterFavorites'
import { useTranslation } from '../../i18n/useTranslation'

export function FavoritesPage() {
  const { t } = useTranslation()
  const { data: games, isLoading: gamesLoading, isError: gamesError } = useGames()
  const { data: favoriteKeys, isLoading: keysLoading } = useFavoriteKeys()

  if (gamesError && !games) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('common.scanError')}
      </div>
    )
  }

  if (gamesLoading || keysLoading || !games || !favoriteKeys) {
    return (
      <div className="grid grid-cols-5 gap-4 p-6">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full rounded-md" />
        ))}
      </div>
    )
  }

  const favorites = filterFavorites(games, favoriteKeys)

  if (favorites.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('favorites.empty')}
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
