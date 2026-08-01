import { useState } from 'react'
import { ListMusic, Minimize2, PictureInPicture2 } from 'lucide-react'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaPlaylistPanel } from './MediaPlaylistPanel'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import type { MediaPlaybackState } from './useMediaPlayback'

interface FullscreenVideoOverlayProps {
  mediaRef: (el: HTMLVideoElement | HTMLAudioElement | null) => void
  playback: MediaPlaybackState
  visible: boolean
  onMinimize?: () => void
  onDetach?: () => void
}

// Always mounted whenever the current track is video and this window is
// hosting playback (see MediaPlayerHost) - `visible` only toggles CSS
// display, never whether the <video> element itself is mounted, so
// minimizing back to the docked bar doesn't tear down and rebuffer it;
// playback (including audio) just continues off-screen (display:none does
// not stop a <video>'s decoding/audio per the HTML spec).
export function FullscreenVideoOverlay({
  mediaRef,
  playback,
  visible,
  onMinimize,
  onDetach,
}: FullscreenVideoOverlayProps) {
  const { t } = useTranslation()
  const [showPlaylist, setShowPlaylist] = useState(false)

  return (
    <div className={cn('fixed inset-0 z-50 flex-col bg-black', visible ? 'flex' : 'hidden')}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <video
          ref={mediaRef}
          {...playback.mediaElementProps}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="flex flex-col gap-2 bg-black/80 p-3">
        <MediaTransportBar playback={playback} dark />
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={() => setShowPlaylist((v) => !v)}
            aria-label={t('media.playlist')}
            className={cn('text-white/70 hover:text-white', showPlaylist && 'text-white')}
          >
            <ListMusic className="h-4 w-4" />
          </button>
          {onDetach && (
            <button
              onClick={onDetach}
              aria-label={t('media.detachWindow')}
              className="text-white/70 hover:text-white"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          )}
          {onMinimize && (
            <button
              onClick={onMinimize}
              aria-label={t('media.minimize')}
              className="text-white/70 hover:text-white"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {showPlaylist && <MediaPlaylistPanel dark className="max-h-40" />}
      </div>
    </div>
  )
}
