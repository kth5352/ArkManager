import { useState, type MouseEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import logoUrl from '../../../LOGO.png'
import { Captions, ListMusic, Maximize2, PictureInPicture2, X } from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import {
  useMediaSidebarOpenQuery,
  useSetMediaSidebarOpenMutation,
} from '../../services/settingsService'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaLikeButton } from './MediaLikeButton'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { useTranslation } from '../../i18n/useTranslation'
import type { ParsedLyrics } from '../../lib/lrc'
import type { MediaPlaybackState } from './useMediaPlayback'
import { Button } from '../ui/button'
import { HoverTooltip } from '../ui/hover-tooltip'
import { cn } from '../../lib/utils'
import { MarqueeText } from '../ui/marquee-text'

interface MediaPlayerBarProps {
  playback: MediaPlaybackState
  isDetached: boolean
  onExpandVideo?: () => void
  lyricsEnabled?: boolean
  parsedLyrics?: ParsedLyrics | null
  onToggleLyrics?: () => void
  subtitlePipOpen?: boolean
  onDetach?: () => void
}

// The slim, always-docked bar - used whenever the current track (video or
// audio) is minimized, or playback is running in the detached window
// instead. Never hosts the actual <video>/<audio> element itself - see
// FullscreenMediaOverlay, which stays mounted (just CSS-hidden) whenever
// this window isn't detached, for both video and audio, so minimizing back
// to this bar doesn't tear down and rebuffer anything.
//
// Two rows: a top row (thumbnail/placeholder-logo + track name + like, the
// whole area clickable to expand to fullscreen) and a bottom row (a compact
// MediaTransportBar plus a queue-list button). The old inline playlist
// popover (MediaPlaylistPanel) and inline lyric-text preview popover are
// both gone - the list button now opens the MediaSidebar's "current queue"
// tab directly instead (see useSetMediaSidebarOpenMutation +
// setSidebarActiveTab below - both globally accessible, same as Task 6's
// lyrics bridge, so no prop threading through MediaPlayerHost is needed).
// The Captions on/off toggle itself still lives inside MediaTransportBar
// and is unaffected by any of this - only the small inline text-preview
// popover that used to render here is removed, since the sidebar's "자막
// 로그" tab is now the place to actually read lyrics from the docked bar.
export function MediaPlayerBar({
  playback,
  isDetached,
  onExpandVideo,
  lyricsEnabled = false,
  parsedLyrics = null,
  onToggleLyrics,
  subtitlePipOpen = false,
  onDetach,
}: MediaPlayerBarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const clearPlaylist = useMediaPlayerStore((s) => s.clearPlaylist)
  const setSidebarActiveTab = useMediaPlayerStore((s) => s.setSidebarActiveTab)
  const sidebarActiveTab = useMediaPlayerStore((s) => s.sidebarActiveTab)
  const { data: mediaSidebarOpen = false } = useMediaSidebarOpenQuery()
  const hasSyncedLyrics = parsedLyrics?.kind === 'synced'
  const handleToggleSubtitlePip = (e: MouseEvent): void => {
    e.stopPropagation()
    if (subtitlePipOpen) window.api.media.closeSubtitlePipWindow()
    else window.api.media.openSubtitlePipWindow()
  }
  const setSidebarOpen = useSetMediaSidebarOpenMutation()
  // Tracked by path (not a plain boolean) so switching to a different track
  // - even one whose own thumbnail also happens to fail - doesn't keep
  // showing a stale failure from whatever track played before it, same
  // pattern as FullscreenMediaOverlay/MediaPage/PlayerWindowPage.
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)
  const thumbFailed = thumbFailedPath === playback.track.path

  // MediaSidebar (where the "queue" tab actually lives) only renders on
  // /media - see AppLayout.tsx's render gate. This bar itself is mounted
  // on every route (via MediaPlayerHost), so from anywhere else this used
  // to silently write sidebar-open/queue-tab state with nothing visible
  // rendering it. Navigating to /media makes the click do something the
  // user can see, same pattern as FolderTreeTab.tsx/usePlayAsmrFolder.ts's
  // own navigate({ to: '/media' }) calls from off-route.
  //
  // A real toggle - closes if the sidebar is already open and already
  // showing the queue tab, otherwise opens it (or switches it) to queue -
  // mirrors MediaPage.tsx's own sidebar-toggle button
  // (`mutate(!mediaSidebarOpen)`), which this button used to NOT match:
  // it always forced the sidebar open and never closed it back on a
  // second click, unlike every other toggle in this app.
  const openQueueTab = (): void => {
    if (mediaSidebarOpen && sidebarActiveTab === 'queue') {
      setSidebarOpen.mutate(false)
      return
    }
    setSidebarOpen.mutate(true)
    setSidebarActiveTab('queue')
    navigate({ to: '/media' })
  }

  const handleBarClick = (): void => {
    if (!isDetached && onExpandVideo) onExpandVideo()
  }

  return (
    <div
      onClick={handleBarClick}
      className="flex flex-col gap-1 border-t border-border bg-card px-3 py-2"
    >
      {isDetached && (
        <span className="w-fit shrink-0 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {t('media.playingInOtherWindow')}
        </span>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={isDetached || !onExpandVideo}
          onClick={onExpandVideo}
          aria-label={t('media.expand')}
          className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted disabled:cursor-default"
        >
          {thumbFailed ? (
            <img src={logoUrl} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <img
              src={buildMediaThumbnailUrl(playback.track.path)}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
              onError={() => setThumbFailedPath(playback.track.path)}
            />
          )}
        </button>
        <MediaLikeButton path={playback.track.path} name={playback.track.name} />
        <button
          type="button"
          disabled={isDetached || !onExpandVideo}
          onClick={onExpandVideo}
          aria-label={t('media.expand')}
          className="min-w-0 flex-1 text-left disabled:cursor-default"
        >
          <MarqueeText text={playback.track.name} className="text-xs" />
        </button>
        {!isDetached && onExpandVideo && (
          <HoverTooltip content={t('media.expandVideo')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={onExpandVideo}
              aria-label={t('media.expandVideo')}
              className="shrink-0"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </HoverTooltip>
        )}
        {!isDetached && onDetach && (
          <HoverTooltip content={t('media.detachWindow')}>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation()
                onDetach()
              }}
              aria-label={t('media.detachWindow')}
              className="shrink-0"
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
            className={cn('shrink-0', subtitlePipOpen && 'text-foreground')}
          >
            <Captions className="h-4 w-4" />
          </Button>
        </HoverTooltip>
        <div className="h-4 w-px shrink-0 bg-border" />
        <HoverTooltip content={t('media.closePlaylist')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation()
              clearPlaylist()
            }}
            aria-label={t('media.closePlaylist')}
            className="shrink-0 transition-colors hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </Button>
        </HoverTooltip>
      </div>

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <MediaTransportBar
          playback={playback}
          compact
          lyricsEnabled={lyricsEnabled}
          hasLyrics={parsedLyrics !== null}
          onToggleLyrics={onToggleLyrics}
        />
        <HoverTooltip content={t('media.playlist')}>
          <Button
            variant="secondary"
            size="icon"
            onClick={openQueueTab}
            aria-label={t('media.playlist')}
            aria-pressed={mediaSidebarOpen && sidebarActiveTab === 'queue'}
            className="shrink-0"
          >
            <ListMusic className="h-5 w-5" />
          </Button>
        </HoverTooltip>
      </div>
    </div>
  )
}
