import { useState } from 'react'
import { ListMusic, Maximize2, X } from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { MediaTransportBar } from './MediaTransportBar'
import { MediaPlaylistPanel } from './MediaPlaylistPanel'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import { getActiveLyricLine, type ParsedLyrics } from '../../lib/lrc'
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
export function MediaPlayerBar({
  playback,
  isDetached,
  onExpandVideo,
  lyricsEnabled = false,
  parsedLyrics = null,
  onToggleLyrics,
}: MediaPlayerBarProps) {
  const { t } = useTranslation()
  const [showPlaylist, setShowPlaylist] = useState(false)
  const clearPlaylist = useMediaPlayerStore((s) => s.clearPlaylist)
  const lyricText =
    !lyricsEnabled || !parsedLyrics
      ? null
      : parsedLyrics.kind === 'static'
        ? parsedLyrics.lines.join('\n')
        : getActiveLyricLine(parsedLyrics, playback.currentTime)?.text ?? null

  return (
    <div className="relative flex items-center gap-3 border-t border-border bg-card px-3 py-2">
      {isDetached && (
        <span className="shrink-0 rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
          {t('media.playingInOtherWindow')}
        </span>
      )}

      <MediaTransportBar
        playback={playback}
        lyricsEnabled={lyricsEnabled}
        hasLyrics={parsedLyrics !== null}
        onToggleLyrics={onToggleLyrics}
      />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShowPlaylist((v) => !v)}
        aria-label={t('media.playlist')}
        className={cn(
          'shrink-0',
          showPlaylist && 'text-foreground'
        )}
      >
        <ListMusic className="h-4 w-4" />
      </Button>
      {/* Right-aligned to match FullscreenMediaOverlay's minimize button
          position (also the rightmost of its own icon row) - previously
          this sat on the far left of the docked bar, so expanding then
          collapsing moved your cursor from one end of the bar to the other.
          Kept left of the divider/X below (not adjacent to it) since X
          clears the whole playlist - a much more destructive action than
          toggling the expanded view - and a misclick here should never
          land on that button instead. */}
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

      {showPlaylist && (
        <div className="absolute bottom-full right-3 z-50 mb-1 max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          <MediaPlaylistPanel />
        </div>
      )}
      {lyricText && (
        <div className="absolute bottom-full left-3 right-3 z-40 mb-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover p-3 text-sm whitespace-pre-wrap shadow-md">
          {lyricText}
        </div>
      )}
    </div>
  )
}
