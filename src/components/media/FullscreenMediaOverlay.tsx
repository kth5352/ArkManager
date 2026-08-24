// src/components/media/FullscreenMediaOverlay.tsx
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ListMusic, Minimize2, PictureInPicture2 } from 'lucide-react'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaLikeButton } from './MediaLikeButton'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { useTranslation } from '../../i18n/useTranslation'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useSetMediaSidebarOpenMutation } from '../../services/settingsService'
import { cn } from '../../lib/utils'
import { getActiveLyricLine, type ParsedLyrics } from '../../lib/lrc'
import type { MediaPlaybackState } from './useMediaPlayback'
import logoUrl from '../../../LOGO.png'

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
  const navigate = useNavigate()
  const setSidebarActiveTab = useMediaPlayerStore((s) => s.setSidebarActiveTab)
  const setSidebarOpen = useSetMediaSidebarOpenMutation()
  // Tracked by path (not a plain boolean) so switching to a different track
  // - even one whose own thumbnail also happens to fail - doesn't keep
  // showing a stale failure from whatever track played before it, same
  // reasoning as GameThumbnail.tsx's own localFailedPath.
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)
  const thumbFailed = thumbFailedPath === playback.track.path

  // Opens the sidebar's "current queue" tab instead of this overlay's own
  // (now removed) showPlaylist/MediaPlaylistPanel popover - mirrors
  // MediaPlayerBar.tsx's openQueueTab exactly (same three calls, all
  // globally accessible so no prop threading through MediaPlayerHost is
  // needed). The sidebar's z-[60] sits deliberately above this overlay's
  // z-50 (see MediaSidebar.tsx's own comment) specifically so it stays
  // usable during fullscreen, which is what made this overlay's own
  // duplicate popover UI superseded in the first place. MediaSidebar only
  // renders on /media though (AppLayout.tsx's render gate), and this
  // overlay - like the docked bar - can be visible from any route, so the
  // navigate() call is what actually makes the sidebar it just opened
  // show up anywhere.
  const openQueueTab = (): void => {
    setSidebarOpen.mutate(true)
    setSidebarActiveTab('queue')
    navigate({ to: '/media' })
  }

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
              <div className="flex h-32 w-32 items-center justify-center">
                <img src={logoUrl} alt="" className="h-full w-full object-contain opacity-30" />
              </div>
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
          <div className="pointer-events-none absolute bottom-6 left-6 right-6 text-center">
            {getActiveLyricLine(parsedLyrics, playback.currentTime)?.text && (
              <span className="rounded bg-black/70 px-3 py-1.5 text-lg font-medium text-white">
                {getActiveLyricLine(parsedLyrics, playback.currentTime)?.text}
              </span>
            )}
          </div>
        )}
        {lyricsEnabled && parsedLyrics?.kind === 'static' && (
          <div className="pointer-events-none absolute bottom-6 left-6 right-6 max-h-48 overflow-y-auto text-center">
            <p className="inline-block whitespace-pre-wrap rounded bg-black/70 px-3 py-1.5 text-lg font-medium text-white">
              {parsedLyrics.lines.join('\n')}
            </p>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 bg-black/80 p-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-white/10">
            {thumbFailed ? (
              <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
            ) : (
              <img
                src={buildMediaThumbnailUrl(playback.track.path)}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                draggable={false}
                onError={() => setThumbFailedPath(playback.track.path)}
              />
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-xs text-white">{playback.track.name}</span>
          <MediaLikeButton path={playback.track.path} name={playback.track.name} className="text-white/70 hover:text-white" />
        </div>
        <div className="flex items-center gap-3">
          <MediaTransportBar
            playback={playback}
            dark
            compact
            lyricsEnabled={lyricsEnabled}
            hasLyrics={parsedLyrics !== null}
            onToggleLyrics={onToggleLyrics}
          />
          <button
            onClick={openQueueTab}
            aria-label={t('media.playlist')}
            className="shrink-0 text-white/70 hover:text-white"
          >
            <ListMusic className="h-4 w-4" />
          </button>
          {onDetach && (
            <button
              onClick={onDetach}
              aria-label={t('media.detachWindow')}
              className="shrink-0 text-white/70 hover:text-white"
            >
              <PictureInPicture2 className="h-4 w-4" />
            </button>
          )}
          {onMinimize && (
            <button
              onClick={onMinimize}
              aria-label={t('media.minimize')}
              className="shrink-0 text-white/70 hover:text-white"
            >
              <Minimize2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
