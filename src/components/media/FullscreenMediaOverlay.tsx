// src/components/media/FullscreenMediaOverlay.tsx
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Captions, ListMusic, Minimize2, PictureInPicture2 } from 'lucide-react'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaLikeButton } from './MediaLikeButton'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { useTranslation } from '../../i18n/useTranslation'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import {
  useMediaSidebarOpenQuery,
  useMediaSidebarWidthQuery,
  useSetMediaSidebarOpenMutation,
} from '../../services/settingsService'
import { MEDIA_SIDEBAR_WIDTH_DEFAULT } from '../../lib/clampMediaSidebarWidth'
import { cn } from '../../lib/utils'
import { getActiveLyricLine, type ParsedLyrics } from '../../lib/lrc'
import type { MediaPlaybackState } from './useMediaPlayback'
import logoUrl from '../../../LOGO.png'
import { HoverTooltip } from '../ui/hover-tooltip'
import { Button } from '../ui/button'

interface FullscreenMediaOverlayProps {
  canvasRef: (el: HTMLCanvasElement | null) => void
  playback: MediaPlaybackState
  visible: boolean
  onMinimize?: () => void
  onDetach?: () => void
  lyricsEnabled?: boolean
  parsedLyrics?: ParsedLyrics | null
  onToggleLyrics?: () => void
  subtitlePipOpen?: boolean
}

// Always mounted whenever this window is hosting playback and isn't
// detached (see MediaPlayerHost) - covers both video and audio (see
// docs/superpowers/specs/2026-08-03-media-thumbnails-design.md section 6):
// video always fills this with a <canvas> that mpv's utility process
// pushes decoded frames onto; audio has no on-screen playback element at
// all (mpv plays audio in the utility process regardless of what's on
// screen) and just shows the resolved thumbnail large, or a generic icon
// once that request 404s. `visible` only toggles CSS display, never
// whether the canvas itself is mounted, so minimizing back to the docked
// bar doesn't tear down and rebuffer anything - playback continues
// off-screen either way (mpv keeps decoding/playing in its own process
// independent of this window's own visibility).
export function FullscreenMediaOverlay({
  canvasRef,
  playback,
  visible,
  onMinimize,
  onDetach,
  lyricsEnabled = false,
  parsedLyrics = null,
  onToggleLyrics,
  subtitlePipOpen = false,
}: FullscreenMediaOverlayProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const setSidebarActiveTab = useMediaPlayerStore((s) => s.setSidebarActiveTab)
  const sidebarActiveTab = useMediaPlayerStore((s) => s.sidebarActiveTab)
  const setMediaFullscreenBarHeight = useMediaPlayerStore((s) => s.setMediaFullscreenBarHeight)
  const setSidebarOpen = useSetMediaSidebarOpenMutation()
  const { data: mediaSidebarOpen = false } = useMediaSidebarOpenQuery()
  const { data: mediaSidebarWidth = MEDIA_SIDEBAR_WIDTH_DEFAULT } = useMediaSidebarWidthQuery()
  // MediaSidebar only ever renders on /media (AppLayout.tsx's own render
  // gate) - matching that condition here (rather than just checking
  // mediaSidebarOpen alone) avoids reserving space for a sidebar that
  // isn't actually on screen when a video auto-expands to fullscreen from
  // some other route (e.g. Explorer).
  const splitForSidebar = pathname === '/media' && mediaSidebarOpen
  // Tracked by path (not a plain boolean) so switching to a different track
  // - even one whose own thumbnail also happens to fail - doesn't keep
  // showing a stale failure from whatever track played before it, same
  // reasoning as GameThumbnail.tsx's own localFailedPath.
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)
  const thumbFailed = thumbFailedPath === playback.track.path

  // Reports this bar's real rendered height to the store so MediaSidebar.tsx
  // can anchor its own bottom edge to it - without this, MediaSidebar would
  // have no way to know how much of the viewport this bar occupies, and
  // would extend down behind/past it instead of stopping exactly above it
  // like it does in docked mode. Measured (not hardcoded) so a future
  // content/padding change here can't silently desync from a guessed pixel
  // value elsewhere. Reads getBoundingClientRect().height rather than the
  // observer entry's own contentRect - contentRect reports only the content
  // box, excluding this element's own `p-3` padding (24px combined
  // top+bottom), which previously underreported the real occupied height by
  // that much.
  const barRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setMediaFullscreenBarHeight(el.getBoundingClientRect().height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [setMediaFullscreenBarHeight])

  const hasSyncedLyrics = parsedLyrics?.kind === 'synced'
  const handleToggleSubtitlePip = (e: MouseEvent): void => {
    e.stopPropagation()
    if (subtitlePipOpen) window.api.media.closeSubtitlePipWindow()
    else window.api.media.openSubtitlePipWindow()
  }

  // Opens the sidebar's "current queue" tab instead of this overlay's own
  // (now removed) showPlaylist/MediaPlaylistPanel popover - mirrors
  // MediaPlayerBar.tsx's openQueueTab exactly (same toggle logic, all
  // globally accessible so no prop threading through MediaPlayerHost is
  // needed). The sidebar's z-[60] sits deliberately above this overlay's
  // z-50 (see MediaSidebar.tsx's own comment) specifically so it stays
  // usable during fullscreen, which is what made this overlay's own
  // duplicate popover UI superseded in the first place. MediaSidebar only
  // renders on /media though (AppLayout.tsx's render gate), and this
  // overlay - like the docked bar - can be visible from any route, so the
  // navigate() call is what actually makes the sidebar it just opened
  // show up anywhere.
  //
  // A real toggle - closes if the sidebar is already open and already
  // showing the queue tab, otherwise opens/switches it to queue - mirrors
  // MediaPage.tsx's own sidebar-toggle button.
  const openQueueTab = (): void => {
    if (mediaSidebarOpen && sidebarActiveTab === 'queue') {
      setSidebarOpen.mutate(false)
      return
    }
    setSidebarOpen.mutate(true)
    setSidebarActiveTab('queue')
    navigate({ to: '/media' })
  }

  return (
    <div className={cn('fixed inset-0 z-50 flex-col bg-black', visible ? 'flex' : 'hidden')}>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        style={{ marginRight: splitForSidebar ? mediaSidebarWidth : 0 }}
      >
        {playback.isVideo ? (
          <canvas ref={canvasRef} className="h-full w-full object-contain" />
        ) : thumbFailed ? (
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
        {lyricsEnabled && parsedLyrics?.kind === 'synced' && (() => {
          const activeLine = getActiveLyricLine(parsedLyrics, playback.currentTime)
          return (
            <div className="pointer-events-none absolute bottom-6 left-6 right-6 text-center">
              {activeLine?.text && (
                <span className="inline-block whitespace-pre-wrap rounded bg-black/70 px-3 py-1.5 text-lg font-medium text-white">
                  {activeLine.text}
                </span>
              )}
            </div>
          )
        })()}
        {lyricsEnabled && parsedLyrics?.kind === 'static' && (
          <div className="pointer-events-none absolute bottom-6 left-6 right-6 max-h-48 overflow-y-auto text-center">
            <p className="inline-block whitespace-pre-wrap rounded bg-black/70 px-3 py-1.5 text-lg font-medium text-white">
              {parsedLyrics.lines.join('\n')}
            </p>
          </div>
        )}
      </div>
      <div ref={barRef} className="flex flex-col gap-2 bg-black/80 p-3">
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
          <MediaLikeButton path={playback.track.path} name={playback.track.name} className="text-white/70 transition-colors hover:text-white" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MediaTransportBar
            playback={playback}
            dark
            compact
            lyricsEnabled={lyricsEnabled}
            hasLyrics={parsedLyrics !== null}
            onToggleLyrics={onToggleLyrics}
          />
          <HoverTooltip content={t('media.playlist')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={openQueueTab}
              aria-label={t('media.playlist')}
              aria-pressed={mediaSidebarOpen && sidebarActiveTab === 'queue'}
              className={cn(
                'shrink-0 text-white/70 hover:text-white',
                mediaSidebarOpen && sidebarActiveTab === 'queue' && 'text-white'
              )}
            >
              <ListMusic className="h-4 w-4" />
            </Button>
          </HoverTooltip>
          {onDetach && (
            <HoverTooltip content={t('media.detachWindow')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDetach}
                aria-label={t('media.detachWindow')}
                className="shrink-0 text-white/70 hover:text-white"
              >
                <PictureInPicture2 className="h-4 w-4" />
              </Button>
            </HoverTooltip>
          )}
          <HoverTooltip content={t('media.subtitlePipToggle')}>
            <Button
              variant="ghost"
              size="icon"
              disabled={!hasSyncedLyrics && !subtitlePipOpen}
              onClick={handleToggleSubtitlePip}
              aria-label={t('media.subtitlePipToggle')}
              aria-pressed={subtitlePipOpen}
              className={cn(
                'shrink-0 text-white/70 hover:text-white',
                subtitlePipOpen && 'text-white'
              )}
            >
              <Captions className="h-4 w-4" />
            </Button>
          </HoverTooltip>
          {onMinimize && (
            <HoverTooltip content={t('media.minimize')}>
              <Button
                variant="ghost"
                size="icon"
                onClick={onMinimize}
                aria-label={t('media.minimize')}
                className="shrink-0 text-white/70 hover:text-white"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </HoverTooltip>
          )}
        </div>
      </div>
    </div>
  )
}
