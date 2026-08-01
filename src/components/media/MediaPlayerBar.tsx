import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ListMusic, Pause, Play, SkipBack, SkipForward, Volume2, X } from 'lucide-react'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { buildMediaUrl } from '../../services/mediaProtocolService'
import { isVideoFile } from '../../../shared/isMediaFile'
import { cn } from '../../lib/utils'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Mounted once in AppLayout - renders nothing while the playlist is empty,
// so most of the app never even has this in the DOM. Playback survives page
// navigation because this component (and the store backing it) lives above
// the router's <Outlet>, not inside any one page.
export function MediaPlayerBar() {
  const playlist = useMediaPlayerStore((s) => s.playlist)
  const currentIndex = useMediaPlayerStore((s) => s.currentIndex)
  const isPlaying = useMediaPlayerStore((s) => s.isPlaying)
  const volume = useMediaPlayerStore((s) => s.volume)
  const setPlaying = useMediaPlayerStore((s) => s.setPlaying)
  const togglePlay = useMediaPlayerStore((s) => s.togglePlay)
  const next = useMediaPlayerStore((s) => s.next)
  const prev = useMediaPlayerStore((s) => s.prev)
  const setVolume = useMediaPlayerStore((s) => s.setVolume)
  const removeFromPlaylist = useMediaPlayerStore((s) => s.removeFromPlaylist)
  const playAt = useMediaPlayerStore((s) => s.playAt)
  const clearPlaylist = useMediaPlayerStore((s) => s.clearPlaylist)

  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const setMediaRef = (el: HTMLVideoElement | HTMLAudioElement | null): void => {
    mediaRef.current = el
  }
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showPlaylist, setShowPlaylist] = useState(false)
  const [resetForPath, setResetForPath] = useState<string | null>(null)

  const track = currentIndex !== null ? (playlist[currentIndex] ?? null) : null

  // Resets the displayed time/duration when the track changes - adjusted
  // during render (React's documented pattern for "state that depends on a
  // changing value from outside", https://react.dev/learn/you-might-not-
  // need-an-effect#adjusting-some-state-when-a-prop-changes) rather than in
  // an effect, since setState directly in an effect body causes an extra
  // cascading render for no benefit here.
  if (track && track.path !== resetForPath) {
    setResetForPath(track.path)
    setCurrentTime(0)
    setDuration(0)
  }

  // Play/pause intent lives in the store (so Explorer/the Media page can
  // trigger it without touching the DOM element directly); this effect is
  // what actually drives the element to match that intent.
  useEffect(() => {
    const el = mediaRef.current
    if (!el || !track) return
    if (isPlaying) el.play().catch(() => {})
    else el.pause()
  }, [isPlaying, track])

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.volume = volume
  }, [volume])

  if (!track) return null

  const isVideo = isVideoFile(track.name)
  const mediaSrc = buildMediaUrl(track.path)

  const handleSeek = (e: ChangeEvent<HTMLInputElement>): void => {
    const value = Number(e.target.value)
    if (mediaRef.current) mediaRef.current.currentTime = value
    setCurrentTime(value)
  }

  const mediaProps = {
    src: mediaSrc,
    onTimeUpdate: () => mediaRef.current && setCurrentTime(mediaRef.current.currentTime),
    onLoadedMetadata: () => mediaRef.current && setDuration(mediaRef.current.duration),
    onEnded: () => next(),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
  }

  return (
    <div className="relative flex items-center gap-3 border-t border-border bg-card px-3 py-2">
      {isVideo ? (
        <video
          ref={setMediaRef}
          {...mediaProps}
          className="h-12 w-20 shrink-0 rounded bg-black object-contain"
        />
      ) : (
        <audio ref={setMediaRef} {...mediaProps} className="hidden" />
      )}

      <button
        onClick={prev}
        disabled={playlist.length < 2}
        aria-label="이전 트랙"
        className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <SkipBack className="h-4 w-4" />
      </button>
      <button
        onClick={togglePlay}
        aria-label={isPlaying ? '일시정지' : '재생'}
        className="shrink-0 text-foreground hover:text-primary"
      >
        {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
      </button>
      <button
        onClick={next}
        disabled={playlist.length < 2}
        aria-label="다음 트랙"
        className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <SkipForward className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-xs">{track.name}</span>
        <div className="flex items-center gap-2">
          <span className="w-9 shrink-0 text-[10px] text-muted-foreground">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="h-1 w-full"
          />
          <span className="w-9 shrink-0 text-[10px] text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Volume2 className="h-4 w-4 text-muted-foreground" />
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

      <button
        onClick={() => setShowPlaylist((v) => !v)}
        aria-label="재생목록"
        className={cn(
          'shrink-0 text-muted-foreground hover:text-foreground',
          showPlaylist && 'text-foreground'
        )}
      >
        <ListMusic className="h-4 w-4" />
      </button>
      <button
        onClick={clearPlaylist}
        aria-label="재생목록 닫기"
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>

      {showPlaylist && (
        <div className="absolute bottom-full right-3 z-50 mb-1 max-h-64 w-72 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {playlist.map((t, i) => (
            <div
              key={t.path}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-1 text-xs',
                i === currentIndex ? 'bg-accent' : 'hover:bg-accent/50'
              )}
            >
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => playAt(i)}>
                {t.name}
              </button>
              <button
                onClick={() => removeFromPlaylist(i)}
                aria-label="재생목록에서 제거"
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
