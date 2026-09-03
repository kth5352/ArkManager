import { useState } from 'react'
import {
  Pause,
  MessageSquareText,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useTranslation } from '../../i18n/useTranslation'
import { cn } from '../../lib/utils'
import type { MediaPlaybackState } from './useMediaPlayback'
import { Button } from '../ui/button'
import { HoverTooltip } from '../ui/hover-tooltip'
import { EqualizerPopover } from './EqualizerPopover'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

interface MediaTransportBarProps {
  playback: MediaPlaybackState
  dark?: boolean
  lyricsEnabled?: boolean
  hasLyrics?: boolean
  onToggleLyrics?: () => void
  // Shrinks the repeat/shuffle/lyrics-toggle/volume cluster's icon sizes and
  // hides the track-name label (the docked bar's own new top row already
  // shows the name - rendering it a second time here would duplicate it).
  // prev/play/next/seek-bar/time keep their normal size regardless, per the
  // design spec's "지금과 동일한 비중 유지" requirement for those.
  compact?: boolean
}

// Prev/play-pause/next/seek/volume row - shared by the docked bar, the
// fullscreen video overlay, and the detached player window. prev/next/
// togglePlay/setVolume come straight from the store rather than through
// `playback`: every place this renders is either the actual playback host
// (fine to drive directly) or a remote control for whichever OTHER window
// is hosting (also fine - that's the whole point of keeping these in the
// shared cross-window control plane, see mediaPlayerStore.ts).
export function MediaTransportBar({
  playback,
  dark,
  lyricsEnabled = false,
  hasLyrics = false,
  onToggleLyrics,
  compact = false,
}: MediaTransportBarProps) {
  const { t } = useTranslation()
  const playlist = useMediaPlayerStore((s) => s.playlist)
  const togglePlay = useMediaPlayerStore((s) => s.togglePlay)
  const next = useMediaPlayerStore((s) => s.next)
  const prev = useMediaPlayerStore((s) => s.prev)
  const volume = useMediaPlayerStore((s) => s.volume)
  const setVolume = useMediaPlayerStore((s) => s.setVolume)
  const toggleMute = useMediaPlayerStore((s) => s.toggleMute)
  const repeatMode = useMediaPlayerStore((s) => s.repeatMode)
  const cycleRepeatMode = useMediaPlayerStore((s) => s.cycleRepeatMode)
  const shuffleMode = useMediaPlayerStore((s) => s.shuffleMode)
  const toggleShuffle = useMediaPlayerStore((s) => s.toggleShuffle)

  const mutedText = dark
    ? 'text-white/70 transition-colors hover:text-white'
    : 'text-muted-foreground transition-colors hover:text-foreground'
  const mainText = dark
    ? 'text-white transition-colors hover:text-white/80'
    : 'text-foreground transition-colors hover:text-primary'

  // Seeking is async (media:// re-fetches a byte range for the new position,
  // see mediaProtocol.ts) - onTimeUpdate keeps firing with the pre-seek
  // position for a moment after handleSeek runs, which would otherwise snap
  // this controlled slider straight back to where it just was, mid-drag.
  // While the user is actively dragging, the slider shows this local value
  // instead of playback.currentTime (never touched by onTimeUpdate), so it
  // can't fight the drag - only committed as a real seek on release.
  const [dragValue, setDragValue] = useState<number | null>(null)
  const commitDrag = (): void => {
    if (dragValue === null) return
    playback.handleSeek(dragValue)
    setDragValue(null)
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      <HoverTooltip content={t('media.previousTrack')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={prev}
          disabled={playlist.length < 2}
          aria-label={t('media.previousTrack')}
          className={`shrink-0 disabled:opacity-40 ${mutedText}`}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
      </HoverTooltip>
      <HoverTooltip content={playback.isPlaying ? t('media.pause') : t('media.play')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePlay}
          aria-label={playback.isPlaying ? t('media.pause') : t('media.play')}
          className={`shrink-0 ${mainText}`}
        >
          {playback.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
      </HoverTooltip>
      <HoverTooltip content={t('media.nextTrack')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={next}
          disabled={playlist.length < 2}
          aria-label={t('media.nextTrack')}
          className={`shrink-0 disabled:opacity-40 ${mutedText}`}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </HoverTooltip>
      <HoverTooltip content={t('media.repeatMode')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleRepeatMode}
          aria-label={t('media.repeatMode')}
          className={cn(
            'shrink-0',
            repeatMode === 'off' ? mutedText : dark ? 'text-white' : 'text-primary'
          )}
        >
          {repeatMode === 'one' ? (
            <Repeat1 className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          ) : (
            <Repeat className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          )}
        </Button>
      </HoverTooltip>
      <HoverTooltip content={t('media.shuffleMode')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleShuffle}
          aria-label={t('media.shuffleMode')}
          className={cn(
            'shrink-0',
            shuffleMode ? (dark ? 'text-white' : 'text-primary') : mutedText
          )}
        >
          <Shuffle className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </Button>
      </HoverTooltip>
      {onToggleLyrics && (
        <HoverTooltip content={t('media.toggleLyrics')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleLyrics}
            disabled={!hasLyrics}
            aria-label={t('media.toggleLyrics')}
            aria-pressed={lyricsEnabled}
            className={cn(
              'shrink-0 disabled:opacity-40',
              lyricsEnabled && hasLyrics ? (dark ? 'text-white' : 'text-primary') : mutedText
            )}
          >
            <MessageSquareText className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </Button>
        </HoverTooltip>
      )}
      <EqualizerPopover dark={dark} />

      <div className="flex flex-1 flex-col gap-1 min-w-40">
        {!compact && (
          <span className={`truncate text-xs ${dark ? 'text-white' : ''}`}>
            {playback.track.name}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span
            className={`w-9 shrink-0 text-[10px] ${dark ? 'text-white/70' : 'text-muted-foreground'}`}
          >
            {formatTime(playback.currentTime)}
          </span>
          <input
            type="range"
            min={0}
            // `playback.duration || 0` would leave this as Infinity while
            // the real duration isn't known yet (see useMediaPlayback's
            // durationchange handling) - a range input with max="Infinity"
            // doesn't drag correctly, which is what made seeking silently
            // do nothing until the duration happened to resolve.
            max={Number.isFinite(playback.duration) ? playback.duration : 0}
            value={dragValue ?? playback.currentTime}
            onChange={(e) => setDragValue(Number(e.target.value))}
            onPointerUp={commitDrag}
            onKeyUp={commitDrag}
            className="h-1 w-full"
          />
          <span
            className={`w-9 shrink-0 text-[10px] ${dark ? 'text-white/70' : 'text-muted-foreground'}`}
          >
            {formatTime(playback.duration)}
          </span>
        </div>
        {playback.error && (
          <p className="text-[10px] text-destructive">{t('media.playbackError')}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <HoverTooltip content={t('media.toggleMute')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            aria-label={t('media.toggleMute')}
            className={mutedText}
          >
            {volume === 0 ? (
              <VolumeX className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            ) : (
              <Volume2 className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
            )}
          </Button>
        </HoverTooltip>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className={compact ? 'w-20' : 'w-28'}
        />
      </div>
    </div>
  )
}
