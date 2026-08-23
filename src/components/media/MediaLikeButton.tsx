import { Heart } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useIsTrackLiked, useToggleTrackLike } from '../../services/mediaPlaylistService'
import { useTranslation } from '../../i18n/useTranslation'

interface MediaLikeButtonProps {
  path: string
  name: string
  className?: string
}

// Shared by the docked bar, fullscreen overlay, sidebar current-queue tab,
// and the Media page's file list - every heart toggle in the app goes
// through this one component so the liked-state query/mutation wiring
// lives in exactly one place.
export function MediaLikeButton({ path, name, className }: MediaLikeButtonProps) {
  const { t } = useTranslation()
  const { data: liked = false } = useIsTrackLiked(path)
  const toggle = useToggleTrackLike()

  return (
    <button
      type="button"
      aria-label={t('media.like')}
      aria-pressed={liked}
      onClick={(event) => {
        event.stopPropagation()
        toggle.mutate({ path, name })
      }}
      className={cn(
        'shrink-0',
        liked ? 'text-destructive' : 'text-muted-foreground hover:text-foreground',
        className
      )}
    >
      <Heart className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} />
    </button>
  )
}
