// src/components/media/FullscreenMediaOverlay.tsx
import { useState } from 'react'
import { ListMusic, Minimize2, Music2, PictureInPicture2 } from 'lucide-react'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaPlaylistPanel } from './MediaPlaylistPanel'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import { getActiveLyricLine, type ParsedLyrics } from '../../lib/lrc'
import type { MediaPlaybackState } from './useMediaPlayback'

interface FullscreenMediaOverlayProps {
  mediaRef: (el: HTMLVideoElement | HTMLAudioElement | null) => void
  playback: MediaPlaybackState
  visible: boolean
  onMinimize?: () => void
  onDetach?: () => void
  lyricsEnabled?: boolean
  parsedLyrics?: ParsedLyrics | null
  onToggleLyrics?: () => void
}

// Always mounted whenever this window is hosting playback and isn't
// detached (see MediaPlayerHost) - covers both video and audio (see
// docs/superpowers/specs/2026-08-03-media-thumbnails-design.md section 6):
// video always fills this with a real <video>; audio renders a hidden
// <audio> (driving actual playback, non-visually) alongside its resolved
// thumbnail shown large, or a generic icon once that request 404s. `visible`
// only toggles CSS display, never whether the element itself is mounted, so
// minimizing back to the docked bar doesn't tear down and rebuffer anything
// - playback continues off-screen either way (display:none does not stop a
// <video>/<audio>'s decoding per the HTML spec).
export function FullscreenMediaOverlay({
  mediaRef,
  playback,
  visible,
  onMinimize,
  onDetach,
  lyricsEnabled = false,
  parsedLyrics = null,
  onToggleLyrics,
}: FullscreenMediaOverlayProps) {
  const { t } = useTranslation()
  const [showPlaylist, setShowPlaylist] = useState(false)
  // Tracked by path (not a plain boolean) so switching to a different track
  // - even one whose own thumbnail also happens to fail - doesn't keep
  // showing a stale failure from whatever track played before it, same
  // reasoning as GameThumbnail.tsx's own localFailedPath.
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)
  const thumbFailed = thumbFailedPath === playback.track.path

  return (
    <div className={cn('fixed inset-0 z-50 flex-col bg-black', visible ? 'flex' : 'hidden')}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        {playback.isVideo ? (
          <video
            ref={mediaRef}
            {...playback.mediaElementProps}
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <audio ref={mediaRef} {...playback.mediaElementProps} />
            {thumbFailed ? (
              <Music2 className="h-32 w-32 text-white/30" />
            ) : (
              <img
                src={buildMediaThumbnailUrl(playback.track.path)}
                alt=""
                className="max-h-full max-w-full object-contain"
                draggable={false}
                onError={() => setThumbFailedPath(playback.track.path)}
              />
            )}
          </>
        )}
        {lyricsEnabled && parsedLyrics?.kind === 'synced' && (
          <div className="pointer-events-none absolute bottom-6 left-6 right-6 text-center text-lg font-medium text-white">
            {getActiveLyricLine(parsedLyrics, playback.currentTime)?.text}
          </div>
        )}
        {lyricsEnabled && parsedLyrics?.kind === 'static' && (
          <div className="pointer-events-none absolute bottom-6 left-6 right-6 max-h-48 overflow-y-auto text-center text-lg font-medium whitespace-pre-wrap text-white">
            {parsedLyrics.lines.join('\n')}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 bg-black/80 p-3">
        <MediaTransportBar
          playback={playback}
          dark
          lyricsEnabled={lyricsEnabled}
          hasLyrics={parsedLyrics !== null}
          onToggleLyrics={onToggleLyrics}
        />
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
