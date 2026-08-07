import { motion } from 'framer-motion'
import { Heart } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useVisibleGames } from '../../hooks/useVisibleGames'
import {
  useFavoriteKeys,
  useGameUserData,
  useToggleFavorite,
} from '../../services/gameUserDataService'
import { usePendingGalleryOpenStore } from '../../stores/pendingGalleryOpenStore'
import { GameThumbnail } from '../../components/game/GameThumbnail'
import { Skeleton } from '../../components/ui/skeleton'
import { filterFavorites } from '../../lib/filterFavorites'
import { useTranslation } from '../../i18n/useTranslation'
import type { ScannedEntry } from '../../../shared/types/scanner'

// Favorites is a curated view onto entries already fully manageable from
// Gallery/List/DetailList - rather than duplicate the whole detail
// sidebar/context-menu/launch machinery a third time, clicking a card jumps
// to Gallery and opens it there via the same one-shot deep-link signal
// RecentlyPlayedPage already uses. Unfavoriting is still available directly
// on the card since that's this page's whole reason to exist.
function FavoriteCard({ game }: { game: ScannedEntry }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setPendingKey = usePendingGalleryOpenStore((s) => s.setPendingKey)
  const setPendingSearchQuery = usePendingGalleryOpenStore((s) => s.setPendingSearchQuery)
  const { data: userData } = useGameUserData(game)
  const toggleFavorite = useToggleFavorite()

  const handleOpen = (): void => {
    setPendingKey(game.code?.value ?? game.path)
    if (game.code) setPendingSearchQuery(game.code.value)
    navigate({ to: '/' })
  }

  return (
    <motion.div
      onClick={handleOpen}
      whileHover={{ scale: 1.05 }}
      transition={{ duration: 0.15 }}
      className="relative flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <button
        aria-label={t('game.toggleFavorite')}
        onClick={(e) => {
          e.stopPropagation()
          toggleFavorite.mutate({ entry: game, isFavorite: !(userData?.isFavorite ?? false) })
        }}
        className="absolute right-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground hover:text-foreground"
      >
        <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
      </button>
      <div className="flex-1 overflow-hidden bg-muted">
        <GameThumbnail entry={game} />
      </div>
      <div className="shrink-0 p-2">
        <p className="line-clamp-2 break-words text-sm font-medium">{game.name}</p>
        {game.code && <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>}
      </div>
    </motion.div>
  )
}

export function FavoritesPage() {
  const { t } = useTranslation()
  const { data: games, isLoading: gamesLoading, isError: gamesError } = useVisibleGames()
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
        <FavoriteCard key={game.path} game={game} />
      ))}
    </div>
  )
}
