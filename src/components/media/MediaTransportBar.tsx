import { Pause, Play, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useTranslation } from '../../i18n/useTranslation'
import type { MediaPlaybackState } from './useMediaPlayback'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

interface MediaTransportBarProps {
  playback: MediaPlaybackState
  dark?: boolean
}

// Prev/play-pause/next/seek/volume row - shared by the docked bar, the
// fullscreen video overlay, and the detached player window. prev/next/
// togglePlay/setVolume come straight from the store rather than through
// `playback`: every place this renders is either the actual playback host
// (fine to drive directly) or a remote control for whichever OTHER window
// is hosting (also fine - that's the whole point of keeping these in the
// shared cross-window control plane, see mediaPlayerStore.ts).
export function MediaTransportBar({ playback, dark }: MediaTransportBarProps) {
  const { t } = useTranslation()
  const playlist = useMediaPlayerStore((s) => s.playlist)
  const togglePlay = useMediaPlayerStore((s) => s.togglePlay)
  const next = useMediaPlayerStore((s) => s.next)
  const prev = useMediaPlayerStore((s) => s.prev)
  const volume = useMediaPlayerStore((s) => s.volume)
  const setVolume = useMediaPlayerStore((s) => s.setVolume)

  const mutedText = dark
    ? 'text-white/70 hover:text-white'
    : 'text-muted-foreground hover:text-foreground'
  const mainText = dark ? 'text-white hover:text-white/80' : 'text-foreground hover:text-primary'

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <button
        onClick={prev}
        disabled={playlist.length < 2}
        aria-label={t('media.previousTrack')}
        className={`shrink-0 disabled:opacity-40 ${mutedText}`}
      >
        <SkipBack className="h-4 w-4" />
      </button>
      <button
        onClick={togglePlay}
        aria-label={playback.isPlaying ? t('media.pause') : t('media.play')}
        className={`shrink-0 ${mainText}`}
      >
        {playback.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>
      <button
        onClick={next}
        disabled={playlist.length < 2}
        aria-label={t('media.nextTrack')}
        className={`shrink-0 disabled:opacity-40 ${mutedText}`}
      >
        <SkipForward className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`truncate text-xs ${dark ? 'text-white' : ''}`}>
          {playback.track.name}
        </span>
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
            value={playback.currentTime}
            onChange={(e) => playback.handleSeek(Number(e.target.value))}
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
        <Volume2 className={`h-4 w-4 ${dark ? 'text-white/70' : 'text-muted-foreground'}`} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-16"
        />
      </div>
    </div>
  )
}
