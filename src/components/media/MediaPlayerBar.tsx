import { useState } from 'react'
import { ListMusic, Maximize2, X } from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaPlaylistPanel } from './MediaPlaylistPanel'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import type { MediaPlaybackState } from './useMediaPlayback'

interface MediaPlayerBarProps {
  mediaRef: (el: HTMLVideoElement | HTMLAudioElement | null) => void
  playback: MediaPlaybackState
  isDetached: boolean
  onExpandVideo?: () => void
}

// The slim, always-docked bar - used as-is for audio tracks, and also
// (without an inline video element) whenever a video track is minimized or
// playing in the detached window instead. The actual video element itself
// never renders here - see FullscreenVideoOverlay, which stays mounted
// (just CSS-hidden) rather than being torn down and rebuffered every time
// the user minimizes.
export function MediaPlayerBar({
  mediaRef,
  playback,
  isDetached,
  onExpandVideo,
}: MediaPlayerBarProps) {
  const { t } = useTranslation()
  const [showPlaylist, setShowPlaylist] = useState(false)
  const clearPlaylist = useMediaPlayerStore((s) => s.clearPlaylist)

  return (
    <div className="relative flex items-center gap-3 border-t border-border bg-card px-3 py-2">
      {!playback.isVideo && !isDetached && <audio ref={mediaRef} {...playback.mediaElementProps} />}
      {isDetached && (
        <span className="shrink-0 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {t('media.playingInOtherWindow')}
        </span>
      )}
      {playback.isVideo && !isDetached && onExpandVideo && (
        <button
          onClick={onExpandVideo}
          aria-label={t('media.expand')}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}

      <MediaTransportBar playback={playback} />

      <button
        onClick={() => setShowPlaylist((v) => !v)}
        aria-label={t('media.playlist')}
        className={cn(
          'shrink-0 text-muted-foreground hover:text-foreground',
          showPlaylist && 'text-foreground'
        )}
      >
        <ListMusic className="h-4 w-4" />
      </button>
      <button
        onClick={clearPlaylist}
        aria-label={t('media.closePlaylist')}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>

      {showPlaylist && (
        <div className="absolute bottom-full right-3 z-50 mb-1 max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          <MediaPlaylistPanel />
        </div>
      )}
    </div>
  )
}
