import { useCallback, useEffect, useRef, useState } from 'react'
import { useMediaPlayerStore, type MediaTrack } from '../../stores/mediaPlayerStore'
import { isVideoFile } from '../../../shared/isMediaFile'
import { computeMpvRenderSize } from '../../lib/computeMpvRenderSize'
import { buildMediaThumbnailUrl } from '../../services/mediaThumbnailProtocolService'

export interface MediaPlaybackState {
  track: MediaTrack
  isVideo: boolean
  currentTime: number
  duration: number
  isPlaying: boolean
  error: string | null
  handleSeek: (value: number) => void
}

interface UseMediaPlaybackOptions {
  // Only the hosting window actually drives mpv (calls load/play/pause/
  // seek/setVolume, receives frames) - the other window still sees
  // playlist/currentIndex/isPlaying/volume live (shared control plane, see
  // mediaPlayerStore.ts), but must not touch mpv at all, or two windows
  // would fight over the single mpv session.
  isHost: boolean
}

const RESIZE_DEBOUNCE_MS = 120

// Shared by the fullscreen video overlay and the detached player window -
// owns the canvas element's ref, subscribes to mpv's pushed state updates
// and frame port, and drives mpv via IPC to match the store's play/pause/
// volume intent. All hooks run unconditionally on every call (never
// skipped based on isHost or whether a track is playing) so this stays
// safe to call from a component that itself must never change its own
// hook count - see `playback` being possibly null instead.
export function useMediaPlayback({ isHost }: UseMediaPlaybackOptions): {
  canvasRef: (el: HTMLCanvasElement | null) => void
  playback: MediaPlaybackState | null
} {
  const playlist = useMediaPlayerStore((s) => s.playlist)
  const currentIndex = useMediaPlayerStore((s) => s.currentIndex)
  const isPlaying = useMediaPlayerStore((s) => s.isPlaying)
  const volume = useMediaPlayerStore((s) => s.volume)
  const setPlaying = useMediaPlayerStore((s) => s.setPlaying)
  const togglePlay = useMediaPlayerStore((s) => s.togglePlay)
  const setVolume = useMediaPlayerStore((s) => s.setVolume)
  const repeatMode = useMediaPlayerStore((s) => s.repeatMode)
  const next = useMediaPlayerStore((s) => s.next)
  const prev = useMediaPlayerStore((s) => s.prev)

  const canvasElRef = useRef<HTMLCanvasElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [resetForPath, setResetForPath] = useState<string | null>(null)

  const track = currentIndex !== null ? (playlist[currentIndex] ?? null) : null
  const isVideo = track ? isVideoFile(track.name) : false

  // Resets displayed time/duration/error when the track changes - adjusted
  // during render (React's documented pattern for "state that depends on a
  // changing value from outside") rather than in an effect.
  if (track && track.path !== resetForPath) {
    setResetForPath(track.path)
    setCurrentTime(0)
    setDuration(0)
    setError(null)
  }

  // Shared by the Media Session 'seekto' handler below and the returned
  // playback.handleSeek - defined here (not inline in the return object,
  // where handleSeek used to live) so an effect declared earlier in this
  // hook can reference the same logic without duplicating it.
  const seekTo = useCallback((value: number) => {
    window.api.mpv.seek(value)
    setCurrentTime(value)
  }, [])

  // Draws incoming frames onto the canvas - registered FIRST, before the
  // becomeHost()/load() effects below that can trigger the main process to
  // push a frame port to this window. Deliberate ordering, not incidental:
  // React runs a component's effects in definition order after every
  // commit, and mpv only pushes a port in response to an async IPC
  // round-trip (becomeHost/load), which can never resolve before this
  // synchronous effect-registration phase finishes - registering the
  // listener first (not just "eventually") is what actually closes the
  // race, not a `window.onload` guard (which only covers the page's very
  // first load, not a later becomeHost() call from an already-mounted
  // component - a real gap found only by testing this exact scenario
  // during Plan A's own manual verification).
  //
  // Uses a native window 'message' listener directly, NOT
  // window.api.mpv.onFramePort - that method does not exist. A raw
  // MessagePort cannot cross the contextBridge isolation boundary in any
  // form (not as a callback argument, not via a listener registered inside
  // preload) - it silently becomes a dead, non-functional port with no
  // error, confirmed empirically during Plan A's Task 6 verification (see
  // electron/preload/index.ts's module-level relay and its long comment,
  // and electronjs.org/docs/latest/tutorial/message-ports for Electron's
  // own documented pattern, which this mirrors exactly). Do NOT re-add a
  // bridged onFramePort method - it will typecheck and silently fail.
  //
  // Handles a REPLACEMENT port arriving later too (each becomeHost() call
  // makes main post a brand-new port to this window): handleMessage simply
  // re-points `port.onmessage` at whichever port most recently arrived, so
  // there's no "first port wins" assumption anywhere here.
  useEffect(() => {
    const handleMessage = (event: MessageEvent): void => {
      if (event.source !== window || event.data !== 'mpv-frame-port-relay' || !event.ports[0])
        return
      const port = event.ports[0]
      port.onmessage = (e: MessageEvent) => {
        const { frame, width, height } = e.data as {
          frame: ArrayBuffer
          width: number
          height: number
        }
        const canvas = canvasElRef.current
        if (!canvas) return
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.putImageData(new ImageData(new Uint8ClampedArray(frame), width, height), 0, 0)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Becomes host whenever isHost flips true (mount, or a detach/reattach
  // handoff) - this re-points mpv's frame delivery to THIS window without
  // touching playback at all. Safe to call even before any track has ever
  // been loaded (a no-op port re-point with nothing flowing through it
  // yet). Defined AFTER the frame-listening effect above - see that
  // effect's own comment for why the order matters.
  useEffect(() => {
    if (!isHost) return
    window.api.mpv.becomeHost()
  }, [isHost])

  // Loads the current track into mpv whenever it's a NEW track (by path)
  // while this window is host - tracked via a ref (not resetForPath, which
  // also drives local display-state resets and would otherwise reload the
  // same file on every unrelated re-render).
  const lastLoadedPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isHost || !track) return
    if (track.path === lastLoadedPathRef.current) return
    lastLoadedPathRef.current = track.path
    window.api.mpv.load(track.path, isVideoFile(track.name))
  }, [isHost, track])

  // Applies play/pause intent - mirrors the old DOM-element-driven effect,
  // just calling mpv's play/pause IPC instead of el.play()/el.pause().
  //
  // Also covers tearing playback down (playlist cleared, or the last track
  // removed) - `track` goes to null in both cases, but that alone used to
  // be a no-op here (this effect just early-returned on `!track`), so mpv -
  // a separate utility process with no DOM element to naturally stop
  // itself - kept audibly playing whatever was last loaded, orphaned from
  // the now-empty UI. mpv's native addon has no "unload"/"stop" export
  // (see mpv_addon.cc's InitModule: only setPause, seek, setVolume, etc.),
  // so explicitly pausing is what actually silences it.
  //
  // wasTrackLoadedRef tracks track PRESENCE (not "was host"), independent
  // of isHost, so it survives a host handoff correctly - it's set/cleared
  // on every render regardless of isHost, and only the resulting pause()
  // IPC call itself is gated on isHost. This guards against firing pause()
  // on every render while already empty (dependencies wouldn't change
  // again anyway once track stays null, but the ref keeps this correct
  // even so) and, more importantly, means a normal track-to-track change
  // or a plain isPlaying toggle (both of which also change this effect's
  // dependencies) never hits this branch at all - only a real track -> null
  // transition does, exactly once.
  const wasTrackLoadedRef = useRef(false)
  useEffect(() => {
    if (!track) {
      if (isHost && wasTrackLoadedRef.current) window.api.mpv.pause()
      wasTrackLoadedRef.current = false
      return
    }
    wasTrackLoadedRef.current = true
    if (!isHost) return
    if (isPlaying) window.api.mpv.play()
    else window.api.mpv.pause()
  }, [isHost, track, isPlaying])

  // Applies volume - shared control-plane state (mediaPlayerStore.ts), only
  // the actual host pushes it to mpv.
  useEffect(() => {
    if (!isHost) return
    window.api.mpv.setVolume(volume)
  }, [isHost, volume])

  // Subscribes to mpv's pushed state (currentTime/duration/isPlaying/error)
  // - only meaningful while this window is host (mpv only ever pushes to
  // whichever window is currently the frame-port target, but state updates
  // are pushed to that same window regardless of video/audio - see
  // mpvHandlers.ts).
  useEffect(() => {
    if (!isHost) return
    return window.api.mpv.onStateUpdate((state) => {
      setCurrentTime(state.currentTime)
      if (state.duration !== null) setDuration(state.duration)
      setPlaying(state.isPlaying)
      setError(state.error)
    })
  }, [isHost, setPlaying])

  // Track finished naturally (mpv's keep-open pause, surfaced by mpvWorker.ts
  // as an 'ended' message) - this is the mpv-IPC replacement for the old DOM
  // element's `onEnded` handler, and the only place repeatMode === 'one' is
  // ever acted on (next()/prev() deliberately ignore it, see
  // mediaPlayerStore.ts). Repeat-one loops in place by seeking back to 0 and
  // resuming, exactly as the old handler did with currentTime = 0 + play().
  useEffect(() => {
    if (!isHost) return
    return window.api.mpv.onEnded(() => {
      if (repeatMode === 'one') {
        window.api.mpv.seek(0)
        setCurrentTime(0)
        window.api.mpv.play()
        return
      }
      next()
    })
  }, [isHost, repeatMode, next])

  // Debounced, DPR-aware resize - observes the canvas element's own CSS box
  // (which fills its flex container via className, see FullscreenMediaOverlay/
  // PlayerWindowPage) and requests mpv render at that size. Only meaningful
  // while hosting a video track - resize requests for a non-video/no-canvas
  // case are harmless no-ops on the main-process side (mpv.resize just
  // updates pendingWidth/pendingHeight, consumed only by a render loop that
  // isn't running for audio - see Task 1's isVideo gating) but skipped here
  // anyway since there's no canvas element mounted to observe.
  const setCanvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvasElRef.current = el
  }, [])

  useEffect(() => {
    if (!isHost || !isVideo) return
    const canvas = canvasElRef.current
    if (!canvas) return
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const cssWidth = entry.contentRect.width
      const cssHeight = entry.contentRect.height
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        // Never calls resize() with a raw contentRect value - MPV_RESIZE's
        // schema requires positive integers, but contentRect's width/height
        // are fractional doubles and are 0 for a hidden/collapsed container.
        const { width, height } = computeMpvRenderSize(
          cssWidth,
          cssHeight,
          window.devicePixelRatio || 1
        )
        window.api.mpv.resize(width, height)
      }, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(canvas)
    return () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
    // Re-runs whenever the track changes so a fresh video's canvas gets
    // observed too (canvasElRef.current is a ref, not reactive - the
    // effect must re-run to re-attach the observer if the canvas element
    // itself was ever unmounted/remounted, e.g. switching audio -> video).
  }, [isHost, isVideo, track])

  // Left/Right seek +-5s, Up/Down volume +-5%, Space play/pause - global to
  // the window, matches the prior DOM-driven behavior exactly, just calling
  // mpv IPC instead of mutating a live element.
  useEffect(() => {
    if (!track) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      const active = document.activeElement as HTMLElement | null
      const isTextInput =
        !!active &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName) || active.isContentEditable)
      if (isTextInput) return

      const isFocusedButtonLike = !!active && ['BUTTON', 'A'].includes(active.tagName)

      if (event.key === 'ArrowLeft' && isHost) {
        event.preventDefault()
        const value = Math.max(0, currentTime - 5)
        window.api.mpv.seek(value)
        setCurrentTime(value)
      } else if (event.key === 'ArrowRight' && isHost) {
        event.preventDefault()
        // `duration` is 0 both before mpv's async loadfile resolves a real
        // duration and for a file mpv never reports one for - and 0 is a
        // finite number, so a Number.isFinite check would clamp every
        // forward seek to 0 (i.e. rewind to the start). Treat 0 as
        // "unknown" and let the seek through unclamped.
        const max = duration > 0 ? duration : Infinity
        const value = Math.min(max, currentTime + 5)
        window.api.mpv.seek(value)
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
  }, [track, isHost, volume, setVolume, togglePlay, currentTime, duration])

  // Web Media Session API - restores OS-level hardware media key (headset
  // inline buttons, keyboard media keys) and System Media Transport
  // Controls integration. Chromium wires that up automatically for a real
  // <video>/<audio> element, but the libmpv migration replaced that with a
  // <canvas> fed raw decoded frames (video) and audio played entirely
  // inside a separate utility process - there is no DOM media element left
  // for Chromium to associate hardware keys with, so that automatic
  // integration silently stopped working. This restores it explicitly
  // instead; a live user found play/pause hardware keys dead after the
  // migration.
  //
  // Action handlers only ever touch shared store state (setPlaying/prev/
  // next) or call seekTo, exactly like the keyboard shortcut handler above
  // - the actual mpv IPC call only ever fires from whichever window's own
  // effects (above) are currently host, so none of this needs its own
  // isHost gating. Both the fullscreen overlay and the detached window
  // mount this hook and so both set their own navigator.mediaSession from
  // the same shared store state - harmless, since only one window is ever
  // the OS's actual foreground target for hardware keys at a time.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artwork: [{ src: buildMediaThumbnailUrl(track.path) }],
    })
    return () => {
      navigator.mediaSession.metadata = null
    }
  }, [track])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = track ? (isPlaying ? 'playing' : 'paused') : 'none'
  }, [track, isPlaying])

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return
    // duration/position must both be finite for setPositionState - a track
    // whose duration mpv hasn't reported yet (see MediaPlaybackState's own
    // comment elsewhere on this) would otherwise throw synchronously.
    if (!Number.isFinite(duration) || duration <= 0) return
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: 1,
      position: Math.min(currentTime, duration),
    })
  }, [track, currentTime, duration])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.setActionHandler('play', () => setPlaying(true))
    navigator.mediaSession.setActionHandler('pause', () => setPlaying(false))
    navigator.mediaSession.setActionHandler('previoustrack', () => prev())
    navigator.mediaSession.setActionHandler('nexttrack', () => next())
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) seekTo(details.seekTime)
    })
    return () => {
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
      navigator.mediaSession.setActionHandler('seekto', null)
    }
  }, [setPlaying, prev, next, seekTo])

  // Belt-and-suspenders alongside the Web Media Session wiring above:
  // Chromium's own OS media-key routing for that API still depends on
  // Chromium itself believing this window is currently "audible", which
  // never happens here (mpv plays audio entirely inside its own utility
  // process, never through Chromium's audio pipeline) - the Media Session
  // handlers above may simply never be invoked by the OS at all. main's
  // globalShortcut-based interception (mediaHardwareKeys.ts) doesn't depend
  // on that and is the one actually confirmed to reach the app. Both
  // windows that mount this hook receive this broadcast equally (main
  // sends to every open window), so this is gated on isHost - only the
  // window actually driving mpv should act on it, exactly like the
  // keyboard shortcut handler above; the other window picks up the
  // resulting state change via the existing cross-window sync instead of
  // also independently calling these actions itself, which would
  // double-fire (e.g. skip two tracks instead of one).
  useEffect(() => {
    if (!isHost) return
    return window.api.media.onHardwareKey((action) => {
      if (action === 'playpause') togglePlay()
      else if (action === 'previoustrack') prev()
      else if (action === 'nexttrack') next()
    })
  }, [isHost, togglePlay, prev, next])

  if (!track) return { canvasRef: setCanvasRef, playback: null }

  return {
    canvasRef: setCanvasRef,
    playback: {
      track,
      isVideo,
      currentTime,
      duration,
      isPlaying,
      error,
      handleSeek: seekTo,
    },
  }
}
