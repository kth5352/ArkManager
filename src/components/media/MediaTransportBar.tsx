import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { MEDIA_ACCENT, MEDIA_ACCENT_FOREGROUND } from './playerView'
import { formatTime, secondsAtPointer } from './seekPreview'
import { SeekPreviewCard, type SeekPreviewHover } from './SeekPreviewCard'
import { useSeekPreview } from './useSeekPreview'

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
  // 'band' lays the same controls out for the fullscreen bottom band (spec
  // §3.4): a full-width seek bar on top, then play/prev/next/volume/time on
  // the left and repeat/shuffle/lyrics/EQ + `trailing` on the right.
  variant?: 'default' | 'band'
  // Extra buttons appended after the EQ in the band variant's right cluster.
  trailing?: ReactNode
  // True from pointerdown on the seek/volume slider until the pointer is
  // released anywhere - the fullscreen view must not auto-hide mid-drag.
  onDraggingChange?: (dragging: boolean) => void
  onPopoverOpenChange?: (open: boolean) => void
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
  variant = 'default',
  trailing,
  onDraggingChange,
  onPopoverOpenChange,
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
  const band = variant === 'band'

  const mutedText = dark
    ? 'text-white/70 transition-colors hover:text-white'
    : 'text-muted-foreground transition-colors hover:text-foreground'
  const mainText = dark
    ? 'text-white transition-colors hover:text-white/80'
    : 'text-foreground transition-colors hover:text-primary'
  const smallIcon = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'

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

  // The release is watched on window, not the slider: a drag that ends
  // outside the slider (or the band) must still clear the hold.
  const beginSliderDrag = (): void => {
    if (!onDraggingChange) return
    onDraggingChange(true)
    const end = (): void => {
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      onDraggingChange(false)
    }
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  // Scene preview (spec §3.7): video with a known duration only, in every
  // place this bar renders (docked bar, fullscreen band, detached window).
  // A window that isn't hosting mpv never gets a load generation, so there
  // it shows the time pill only.
  const previewEnabled =
    playback.isVideo && Number.isFinite(playback.duration) && playback.duration > 0
  const { onHover: onPreviewHover, frame: previewFrame } = useSeekPreview({
    trackPath: playback.track.path,
    isVideo: playback.isVideo,
    duration: playback.duration,
    generation: playback.loadGeneration,
  })
  const [seekHover, setSeekHover] = useState<SeekPreviewHover | null>(null)
  const seekWrapperRef = useRef<HTMLDivElement | null>(null)
  // Non-null while a seek-thumb drag is being followed on window, so the
  // preview keeps tracking the pointer even outside the bar.
  const seekDragCleanupRef = useRef<(() => void) | null>(null)

  const clearSeekHover = (): void => {
    setSeekHover(null)
    onPreviewHover(null)
  }
  const updateSeekHover = (clientX: number): void => {
    const el = seekWrapperRef.current
    const rect = el?.getBoundingClientRect()
    const seconds =
      previewEnabled && rect ? secondsAtPointer(clientX, rect, playback.duration) : null
    if (seconds === null || !rect) {
      clearSeekHover()
      return
    }
    setSeekHover({ seconds, clientX, wrapperLeft: rect.left, viewportWidth: window.innerWidth })
    onPreviewHover(seconds)
  }
  const beginSeekHoverDrag = (): void => {
    seekDragCleanupRef.current?.()
    const move = (event: PointerEvent): void => updateSeekHover(event.clientX)
    const end = (event: PointerEvent): void => {
      seekDragCleanupRef.current?.()
      const rect = seekWrapperRef.current?.getBoundingClientRect()
      const inside =
        event.type === 'pointerup' &&
        rect !== undefined &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      if (!inside) clearSeekHover()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    seekDragCleanupRef.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      seekDragCleanupRef.current = null
    }
  }
  useEffect(() => () => seekDragCleanupRef.current?.(), [])

  const prevButton = (
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
  )
  const playButton = (
    <HoverTooltip content={playback.isPlaying ? t('media.pause') : t('media.play')}>
      <Button
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        aria-label={playback.isPlaying ? t('media.pause') : t('media.play')}
        className={cn(
          'shrink-0',
          band
            ? 'rounded-full text-primary-foreground transition-[filter] hover:text-primary-foreground hover:brightness-110'
            : mainText
        )}
        style={band ? { background: MEDIA_ACCENT, color: MEDIA_ACCENT_FOREGROUND } : undefined}
      >
        {playback.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </Button>
    </HoverTooltip>
  )
  const nextButton = (
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
  )
  const repeatButton = (
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
          <Repeat1 className={smallIcon} />
        ) : (
          <Repeat className={smallIcon} />
        )}
      </Button>
    </HoverTooltip>
  )
  const shuffleButton = (
    <HoverTooltip content={t('media.shuffleMode')}>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleShuffle}
        aria-label={t('media.shuffleMode')}
        className={cn('shrink-0', shuffleMode ? (dark ? 'text-white' : 'text-primary') : mutedText)}
      >
        <Shuffle className={smallIcon} />
      </Button>
    </HoverTooltip>
  )
  const lyricsButton = onToggleLyrics && (
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
        <MessageSquareText className={smallIcon} />
      </Button>
    </HoverTooltip>
  )
  const equalizer = (
    <EqualizerPopover dark={dark} compact={compact} onOpenChange={onPopoverOpenChange} />
  )
  const seekInput = (
    <div
      ref={seekWrapperRef}
      className="relative flex min-w-0 flex-1 items-center"
      onPointerEnter={(e) => updateSeekHover(e.clientX)}
      onPointerMove={(e) => updateSeekHover(e.clientX)}
      onPointerLeave={() => {
        if (seekDragCleanupRef.current === null) clearSeekHover()
      }}
    >
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
        onPointerDown={() => {
          beginSliderDrag()
          if (previewEnabled) beginSeekHoverDrag()
        }}
        onPointerUp={commitDrag}
        onKeyUp={commitDrag}
        aria-label={band ? t('media.seek') : undefined}
        className="h-1 w-full"
        style={band ? { accentColor: MEDIA_ACCENT } : undefined}
      />
      {previewEnabled && <SeekPreviewCard hover={seekHover} frame={previewFrame} />}
    </div>
  )
  const errorText = playback.error && (
    <p className="text-[10px] text-destructive">{t('media.playbackError')}</p>
  )
  const volumeControl = (
    <div className="flex shrink-0 items-center gap-1">
      <HoverTooltip content={t('media.toggleMute')}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleMute}
          aria-label={t('media.toggleMute')}
          className={mutedText}
        >
          {volume === 0 ? <VolumeX className={smallIcon} /> : <Volume2 className={smallIcon} />}
        </Button>
      </HoverTooltip>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        onPointerDown={beginSliderDrag}
        aria-label={band ? t('media.volume') : undefined}
        className={compact ? 'w-20' : 'w-28'}
        style={band ? { accentColor: MEDIA_ACCENT } : undefined}
      />
    </div>
  )
  const timeClass = `shrink-0 text-[10px] ${dark ? 'text-white/70' : 'text-muted-foreground'}`

  if (band) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-1">
        <div className="flex items-center px-2">{seekInput}</div>
        {errorText && <div className="px-2">{errorText}</div>}
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {playButton}
          {prevButton}
          {nextButton}
          {volumeControl}
          <span className={cn(timeClass, 'ml-2 tabular-nums')}>
            {formatTime(playback.currentTime)} / {formatTime(playback.duration)}
          </span>
          <div className="min-w-4 flex-1" />
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {repeatButton}
            {shuffleButton}
            {lyricsButton}
            {equalizer}
            {trailing}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
      {prevButton}
      {playButton}
      {nextButton}
      {repeatButton}
      {shuffleButton}
      {lyricsButton}
      {equalizer}

      <div className="flex flex-1 flex-col gap-1 min-w-40">
        {!compact && (
          <span className={`truncate text-xs ${dark ? 'text-white' : ''}`}>
            {playback.track.name}
          </span>
        )}
        <div className="flex items-center gap-2">
          <span className={cn('w-9', timeClass)}>{formatTime(playback.currentTime)}</span>
          {seekInput}
          <span className={cn('w-9', timeClass)}>{formatTime(playback.duration)}</span>
        </div>
        {errorText}
      </div>

      {volumeControl}
    </div>
  )
}
