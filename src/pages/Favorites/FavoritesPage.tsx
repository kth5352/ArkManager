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
import { useConfirmedPulse } from '../../hooks/useConfirmedPulse'
import { appToast } from '../../lib/appToast'
import { useTranslation } from '../../i18n/useTranslation'
import { normalizeLibraryPath } from '../../../shared/normalizeLibraryPath'
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
  const favoritePulse = useConfirmedPulse(userData?.isFavorite ?? false, userData !== undefined)

  const handleOpen = (): void => {
    // GalleryPage matches a code-less entry via
    // normalizeLibraryPath(g.path) === pendingOpenKey (lowercased, no
    // trailing slash) - a raw game.path here (mixed case, possibly a
    // trailing separator) would never compare equal, so the deep-link
    // silently does nothing. RecentlyPlayedPage doesn't need this because
    // its entryKey already comes straight from gameUserData.key, which is
    // stored normalized.
    setPendingKey(game.code?.value ?? normalizeLibraryPath(game.path))
    if (game.code) setPendingSearchQuery(game.code.value)
    navigate({ to: '/' })
  }

  return (
    <div
      onClick={handleOpen}
      className="group relative flex aspect-[3/4] cursor-pointer flex-col overflow-hidden rounded-md border border-border bg-card"
    >
      <button
        aria-label={t('game.toggleFavorite')}
        onClick={(e) => {
          e.stopPropagation()
          const isFavorite = !(userData?.isFavorite ?? false)
          toggleFavorite.mutate(
            { entry: game, isFavorite },
            { onError: () => appToast.error(t('game.toggleFavoriteFailed')) }
          )
        }}
        className={`absolute right-2 top-2 z-10 rounded-full bg-background/70 p-1 text-muted-foreground transition-[color,transform] duration-120 hover:text-foreground active:scale-[0.9] motion-reduce:transform-none ${
          favoritePulse ? '[animation:icon-pulse_180ms_ease-in-out] motion-reduce:animate-none' : ''
        }`}
      >
        <Heart className="h-4 w-4" fill={userData?.isFavorite ? 'currentColor' : 'none'} />
      </button>
      {/* Only the cover scales on hover, not the whole card - matches
          RecentlyPlayedRow's thumbnail-only scale convention (and Gallery's
          card, fixed the same way in U4) rather than this card's own
          previous whole-card whileHover. */}
      <div className="flex-1 overflow-hidden bg-muted">
        <div className="h-full w-full transition-transform duration-160 group-hover:scale-[1.02] motion-reduce:transform-none">
          <GameThumbnail entry={game} />
        </div>
      </div>
      <div className="shrink-0 p-3">
        <p className="line-clamp-2 break-words text-sm font-medium">{game.name}</p>
        {game.code && <p className="truncate text-xs text-muted-foreground">{game.code.value}</p>}
      </div>
    </div>
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
