import { useMemo } from 'react'
import { Heart } from 'lucide-react'
import { cn } from '../../lib/utils'
import { useLikedTracks, useToggleTrackLike } from '../../services/mediaPlaylistService'
import { useConfirmedPulse } from '../../hooks/useConfirmedPulse'
import { appToast } from '../../lib/appToast'
import { useTranslation } from '../../i18n/useTranslation'

interface MediaLikeButtonProps {
  path: string
  name: string
  className?: string
}

// Shared by the docked bar, fullscreen overlay, sidebar current-queue tab,
// and the Media page's file list - every heart toggle in the app goes
// through this one component so the liked-state query/mutation wiring
// lives in exactly one place. Derives `liked` from the single shared
// useLikedTracks() query (all liked paths in one IPC round-trip) rather
// than a dedicated useIsTrackLiked(path) query per instance - MediaPage.tsx
// renders a plain, non-virtualized list, so a folder with hundreds of
// tracks would otherwise mount hundreds of simultaneous per-instance
// queries (an N+1 IPC pattern). useIsTrackLiked itself is left exported
// from mediaPlaylistService.ts as a reasonable standalone primitive, just
// unused here.
export function MediaLikeButton({ path, name, className }: MediaLikeButtonProps) {
  const { t } = useTranslation()
  const { data: likedTracks } = useLikedTracks()
  const likedPaths = useMemo(
    () => new Set((likedTracks ?? []).map((track) => track.path)),
    [likedTracks]
  )
  const liked = likedPaths.has(path)
  const toggle = useToggleTrackLike()
  // useToggleTrackLike has no optimistic update (only invalidates on
  // success, so a failed toggle already correctly left the old state
  // untouched) but also had no onError at all - a failed like silently did
  // nothing visible, the same gap found and fixed for Gallery/List/
  // DetailSidebar's favorite/cleared buttons in U4.
  const likedPulse = useConfirmedPulse(liked, likedTracks !== undefined)

  return (
    <button
      type="button"
      aria-label={t('media.like')}
      aria-pressed={liked}
      onClick={(event) => {
        event.stopPropagation()
        toggle.mutate({ path, name }, { onError: () => appToast.error(t('media.likeFailed')) })
      }}
      className={cn(
        'shrink-0 transition-[color,transform] duration-120 active:scale-[0.9] motion-reduce:transform-none',
        liked ? 'text-destructive' : 'text-muted-foreground hover:text-foreground',
        likedPulse && '[animation:icon-pulse_180ms_ease-in-out] motion-reduce:animate-none',
        className
      )}
    >
      <Heart className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} />
    </button>
  )
}
