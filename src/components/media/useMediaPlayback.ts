import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaPlayerStore, type MediaTrack } from '../../stores/mediaPlayerStore'
import { buildMediaUrl } from '../../services/mediaProtocolService'
import { isVideoFile } from '../../../shared/isMediaFile'

export interface MediaPlaybackState {
  track: MediaTrack
  isVideo: boolean
  currentTime: number
  duration: number
  isPlaying: boolean
  error: string | null
  handleSeek: (value: number) => void
  mediaElementProps: {
    src: string
    playsInline: boolean
    onTimeUpdate: () => void
    onLoadedMetadata: () => void
    onDurationChange: () => void
    onEnded: () => void
    onPlay: () => void
    onPause: () => void
    onError: () => void
  }
}

interface UseMediaPlaybackOptions {
  // Only the hosting window actually drives the underlying element (calls
  // play()/pause(), applies volume, reports time) - the other window still
  // sees playlist/currentIndex/isPlaying/volume live (shared control
  // plane, see mediaPlayerStore.ts), but must not mount a real element at
  // all, or the same file would load/decode in two windows at once.
  isHost: boolean
  // True only for the detached player window - periodically reports
  // currentTime to the main process so a reattach (closing that window)
  // can hand a reasonably fresh seek position back to the main window.
  reportTimeToMainProcess?: boolean
}

// Shared by the docked bar (audio), the fullscreen video overlay, and the
// detached player window - owns the actual <video>/<audio> element's ref,
// local playback-position state, and the effects that keep it in sync with
// the store's play/pause intent. All hooks run unconditionally on every
// call (never skipped based on isHost or whether a track is playing) so
// this stays safe to call from a component that itself must never change
// its own hook count - see `playback` being possibly null instead.
//
// Returns `mediaRef` as a sibling of `playback` rather than a field on it -
// `react-hooks/refs` flags any further property access on an object that
// also carries a ref-setter as "accessing a ref during render", even for
// unrelated plain-data fields on that same object (track.name, currentTime,
// etc.), so the two need to stay clearly separate values.
export function useMediaPlayback({
  isHost,
  reportTimeToMainProcess = false,
}: UseMediaPlaybackOptions): {
  mediaRef: (el: HTMLVideoElement | HTMLAudioElement | null) => void
  playback: MediaPlaybackState | null
} {
  const playlist = useMediaPlayerStore((s) => s.playlist)
  const currentIndex = useMediaPlayerStore((s) => s.currentIndex)
  const isPlaying = useMediaPlayerStore((s) => s.isPlaying)
  const volume = useMediaPlayerStore((s) => s.volume)
  const repeatMode = useMediaPlayerStore((s) => s.repeatMode)
  const setPlaying = useMediaPlayerStore((s) => s.setPlaying)
  const togglePlay = useMediaPlayerStore((s) => s.togglePlay)
  const next = useMediaPlayerStore((s) => s.next)
  const setVolume = useMediaPlayerStore((s) => s.setVolume)
  const consumeHandoffTime = useMediaPlayerStore((s) => s.consumeHandoffTime)

  const elRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  // Memoized so the ref identity is stable across renders - an inline
  // `(el) => { elRef.current = el }` defined fresh every render makes React
  // call it with null then the element again on every single re-render
  // (e.g. every currentTime tick), which is wasted churn on a hot path.
  const setMediaRef = useCallback(
    (el: HTMLVideoElement | HTMLAudioElement | null) => {
      elRef.current = el
      if (el && isHost) el.volume = volume
    },
    [isHost, volume]
  )

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [resetForPath, setResetForPath] = useState<string | null>(null)

  const track = currentIndex !== null ? (playlist[currentIndex] ?? null) : null

  // Resets displayed time/duration/error when the track changes - adjusted
  // during render (React's documented pattern for "state that depends on a
  // changing value from outside") rather than in an effect, since setState
  // directly in an effect body causes an extra cascading render for no
  // benefit here.
  if (track && track.path !== resetForPath) {
    setResetForPath(track.path)
    setCurrentTime(0)
    setDuration(0)
    setError(null)
  }

  // Play/pause intent lives in the store (so Explorer, the Media page, and
  // the other window's remote transport controls can all trigger it
  // without touching the DOM element directly); this effect is what
  // actually drives the element to match that intent. A rejected play()
  // (e.g. blocked by an autoplay policy) used to be swallowed silently,
  // leaving isPlaying stuck true with nothing actually audible/visible and
  // no way to tell why - now surfaced via `error` instead.
  useEffect(() => {
    const el = elRef.current
    if (!el || !track || !isHost) return
    if (isPlaying) {
      el.play()
        .then(() => setError(null))
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    } else {
      el.pause()
    }
  }, [isPlaying, track, isHost])

  useEffect(() => {
    if (isHost && elRef.current) elRef.current.volume = volume
  }, [isHost, volume])

  // Applies a cross-window handoff seek exactly once - after this window
  // has become the host for this track, consuming the one-shot value so no
  // other window (or a later render here) reapplies it again.
  useEffect(() => {
    if (!isHost || !track) return
    const seconds = consumeHandoffTime()
    if (seconds !== null && elRef.current) elRef.current.currentTime = seconds
  }, [isHost, track, consumeHandoffTime])

  useEffect(() => {
    if (!isHost || !reportTimeToMainProcess || !isPlaying) return
    const interval = setInterval(() => {
      if (elRef.current) window.api.media.reportTime(elRef.current.currentTime)
    }, 1000)
    return () => clearInterval(interval)
  }, [isHost, reportTimeToMainProcess, isPlaying])

  // Left/Right seek +-5s, Up/Down volume +-5%, Space play/pause - global to
  // the window (not scoped to a focused player element) so these work no
  // matter which page happens to be showing while media plays in the
  // background, matching a real media player's keyboard behavior. Skipped
  // entirely while focus is on a text field, so this doesn't steal keys
  // from search boxes or other range inputs (including this same
  // component's own seek/volume sliders). Space is additionally skipped
  // while a button/link is focused specifically - a focused button/link
  // also activates on a Space keypress natively, so handling it here too
  // would double-toggle play/pause. Arrow keys don't have that native
  // activation behavior on a button, so they must NOT be skipped there too
  // (doing so used to silently disable seek/volume shortcuts app-wide the
  // moment any button, e.g. the transport bar's own Play/Pause button, was
  // clicked and left focused). Seeking only makes sense with a live element
  // to seek (isHost); volume works from either window since it's shared
  // control-plane state (see mediaPlayerStore.ts) that the actual host
  // applies via the effect above regardless of which window changed it.
  useEffect(() => {
    if (!track) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      const isTextInput =
        !!active &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable)
      if (isTextInput) return

      const isFocusedButtonLike = !!active && ['BUTTON', 'A'].includes(active.tagName)

      if (event.key === 'ArrowLeft' && isHost && elRef.current) {
        event.preventDefault()
        const value = Math.max(0, elRef.current.currentTime - 5)
        elRef.current.currentTime = value
        // Seeking over media:// is async (see mediaProtocolService.ts) -
        // onTimeUpdate briefly still reports the pre-seek position, so the
        // displayed time must be updated here too, same as handleSeek does
        // for a drag-seek - otherwise the on-screen time only catches up
        // once onTimeUpdate eventually fires, lagging a beat behind a
        // keyboard seek specifically.
        setCurrentTime(value)
      } else if (event.key === 'ArrowRight' && isHost && elRef.current) {
        event.preventDefault()
        const el = elRef.current
        const max = Number.isFinite(el.duration) ? el.duration : Infinity
        const value = Math.min(max, el.currentTime + 5)
        el.currentTime = value
        setCurrentTime(value)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setVolume(volume + 0.05)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        setVolume(volume - 0.05)
      } else if (event.key === ' ' && !isFocusedButtonLike) {
        event.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [track, isHost, volume, setVolume, togglePlay])

  if (!track) return { mediaRef: setMediaRef, playback: null }

  const handleSeek = (value: number): void => {
    if (elRef.current) elRef.current.currentTime = value
    setCurrentTime(value)
  }

  return {
    mediaRef: setMediaRef,
    playback: {
      track,
      isVideo: isVideoFile(track.name),
      currentTime,
      duration,
      isPlaying,
      error,
      handleSeek,
      mediaElementProps: {
        src: buildMediaUrl(track.path),
        playsInline: true,
        onTimeUpdate: () => elRef.current && setCurrentTime(elRef.current.currentTime),
        onLoadedMetadata: () => elRef.current && setDuration(elRef.current.duration),
        // media:// serves through Electron's net.fetch (see mediaProtocol.ts)
        // rather than a plain file:// load - the element's `duration` is
        // often still Infinity/NaN at loadedmetadata time (the real length
        // isn't known from headers alone yet) and only resolves once more of
        // the stream has been read. durationchange fires again whenever that
        // resolves, which loadedmetadata alone would miss entirely -
        // formatTime's "not finite -> 0:00" fallback was otherwise the only
        // value ever shown.
        onDurationChange: () => elRef.current && setDuration(elRef.current.duration),
        // A track ending naturally respects repeatMode's 'one' case by
        // looping the same element - next() only knows about 'off' vs 'all'
        // (whether to stop or wrap at the end of the playlist), since an
        // explicit skip-forward click should always move to the next track
        // regardless of 'one' (see mediaPlayerStore.ts's own comment).
        onEnded: () => {
          if (repeatMode === 'one' && elRef.current) {
            elRef.current.currentTime = 0
            elRef.current
              .play()
              .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            return
          }
          next()
        },
        onPlay: () => setPlaying(true),
        onPause: () => setPlaying(false),
        onError: () => setError('media-error'),
      },
    },
  }
}
