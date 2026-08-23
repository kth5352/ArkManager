import { useState } from 'react'
import logoUrl from '../../../LOGO.png'
import { ListMusic, Maximize2, X } from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useSetMediaSidebarOpenMutation } from '../../services/settingsService'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaLikeButton } from './MediaLikeButton'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'
import { useTranslation } from '../../i18n/useTranslation'
import type { ParsedLyrics } from '../../lib/lrc'
import type { MediaPlaybackState } from './useMediaPlayback'
import { Button } from '../ui/button'

interface MediaPlayerBarProps {
  playback: MediaPlaybackState
  isDetached: boolean
  onExpandVideo?: () => void
  lyricsEnabled?: boolean
  parsedLyrics?: ParsedLyrics | null
  onToggleLyrics?: () => void
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
}: MediaPlayerBarProps) {
  const { t } = useTranslation()
  const clearPlaylist = useMediaPlayerStore((s) => s.clearPlaylist)
  const setSidebarActiveTab = useMediaPlayerStore((s) => s.setSidebarActiveTab)
  const setSidebarOpen = useSetMediaSidebarOpenMutation()
  // Tracked by path (not a plain boolean) so switching to a different track
  // - even one whose own thumbnail also happens to fail - doesn't keep
  // showing a stale failure from whatever track played before it, same
  // pattern as FullscreenMediaOverlay/MediaPage/PlayerWindowPage.
  const [thumbFailedPath, setThumbFailedPath] = useState<string | null>(null)
  const thumbFailed = thumbFailedPath === playback.track.path

  const openQueueTab = (): void => {
    setSidebarOpen.mutate(true)
    setSidebarActiveTab('queue')
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border bg-card px-3 py-2">
      {isDetached && (
        <span className="w-fit shrink-0 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {t('media.playingInOtherWindow')}
        </span>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!onExpandVideo}
          onClick={onExpandVideo}
          aria-label={t('media.expand')}
          className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
        >
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-muted">
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
          </div>
          <span className="min-w-0 flex-1 truncate text-xs">{playback.track.name}</span>
        </button>
        <MediaLikeButton path={playback.track.path} name={playback.track.name} />
        {!isDetached && onExpandVideo && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onExpandVideo}
            aria-label={t('media.expand')}
            className="shrink-0"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        )}
        <div className="h-4 w-px shrink-0 bg-border" />
        <Button
          variant="ghost"
          size="icon"
          onClick={clearPlaylist}
          aria-label={t('media.closePlaylist')}
          className="shrink-0 hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <MediaTransportBar
          playback={playback}
          compact
          lyricsEnabled={lyricsEnabled}
          hasLyrics={parsedLyrics !== null}
          onToggleLyrics={onToggleLyrics}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={openQueueTab}
          aria-label={t('media.playlist')}
          className="shrink-0"
        >
          <ListMusic className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
