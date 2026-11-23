// @vitest-environment jsdom
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MpvEndedPayload, MpvStateUpdate } from '../../../shared/types/ipc'
import { useMediaPlayerStore } from '../../stores/mediaPlayerStore'
import { useMediaPlayback, type MediaPlaybackState } from './useMediaPlayback'

// Load identity end to end on the renderer side: the payloads below are the
// exact shapes mpvHandlers.ts relays (see its relay tests), fed into the real
// hook through a fake window.api.
const A = { path: 'D:/m/a.mp3', name: 'a.mp3' }
const B = { path: 'D:/m/b.mp3', name: 'b.mp3' }
const C = { path: 'D:/m/c.mp3', name: 'c.mp3' }

describe('useMediaPlayback load identity', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let latest: MediaPlaybackState | null
  let stateListener: ((s: MpvStateUpdate) => void) | null
  let endedListener: ((p: MpvEndedPayload) => void) | null
  let mpv: Record<string, ReturnType<typeof vi.fn>>
  const globals = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }

  function Probe(): null {
    latest = useMediaPlayback({ isHost: true }).playback
    return null
  }

  function update(path: string | null, generation: number, title: string): MpvStateUpdate {
    return {
      isPlaying: true,
      currentTime: 1,
      duration: 100,
      error: null,
      mediaTitle: title,
      loadGeneration: generation,
      loadedPath: path,
    }
  }

  beforeEach(() => {
    globals.IS_REACT_ACT_ENVIRONMENT = true
    stateListener = null
    endedListener = null
    mpv = {
      becomeHost: vi.fn(),
      load: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      resize: vi.fn(),
      onStateUpdate: vi.fn((cb: (s: MpvStateUpdate) => void) => {
        stateListener = cb
        return () => {
          stateListener = null
        }
      }),
      onEnded: vi.fn((cb: (p: MpvEndedPayload) => void) => {
        endedListener = cb
        return () => {
          endedListener = null
        }
      }),
    }
    ;(window as unknown as { api: unknown }).api = {
      mpv,
      media: { onHardwareKey: () => () => {} },
    }
    useMediaPlayerStore.setState({
      playlist: [A, B, C],
      currentIndex: 0,
      isPlaying: true,
      repeatMode: 'off',
      shuffleMode: false,
    })
    container = document.createElement('div')
    root = createRoot(container)
    act(() => {
      root.render(createElement(Probe))
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    useMediaPlayerStore.setState({ playlist: [], currentIndex: null, isPlaying: false })
  })

  const pushState = (s: MpvStateUpdate): void => act(() => stateListener?.(s))
  const pushEnded = (p: MpvEndedPayload): void => act(() => endedListener?.(p))
  const currentPath = (): string | undefined => {
    const { playlist, currentIndex } = useMediaPlayerStore.getState()
    return currentIndex === null ? undefined : playlist[currentIndex]?.path
  }

  it('adopts the identity of an update for the current track after a track-change reset', () => {
    pushState(update(A.path, 1, 'Song A'))
    expect(latest?.loadGeneration).toBe(1)
    expect(latest?.title).toBe('Song A')

    act(() => useMediaPlayerStore.getState().next())
    expect(latest?.track.path).toBe(B.path)
    expect(latest?.loadGeneration).toBeNull()

    // A late update of A after the switch is not adopted...
    pushState(update(A.path, 1, 'Song A'))
    expect(latest?.loadGeneration).toBeNull()
    expect(latest?.title).toBe('b')

    // ...B's own update is.
    pushState(update(B.path, 2, 'Song B'))
    expect(latest?.loadGeneration).toBe(2)
    expect(latest?.loadedPath).toBe(B.path)
    expect(latest?.title).toBe('Song B')
  })

  it('ignores a late ended of the previous track after the user pressed Next', () => {
    act(() => useMediaPlayerStore.getState().next())
    expect(currentPath()).toBe(B.path)

    pushEnded({ loadGeneration: 1, loadedPath: A.path })
    expect(currentPath()).toBe(B.path)
  })

  it('advances on an ended of the current track', () => {
    pushEnded({ loadGeneration: 1, loadedPath: A.path })
    expect(currentPath()).toBe(B.path)
  })

  it('keeps the plain behavior for an ended without load context', () => {
    pushEnded({ loadGeneration: 0, loadedPath: null })
    expect(currentPath()).toBe(B.path)
  })

  it('does not seek the new track to 0 under repeat-one for a late ended', () => {
    act(() => useMediaPlayerStore.setState({ repeatMode: 'one' }))
    act(() => useMediaPlayerStore.getState().next())
    mpv.seek.mockClear()

    pushEnded({ loadGeneration: 1, loadedPath: A.path })
    expect(mpv.seek).not.toHaveBeenCalled()

    pushEnded({ loadGeneration: 2, loadedPath: B.path })
    expect(mpv.seek).toHaveBeenCalledWith(0)
    expect(currentPath()).toBe(B.path)
  })
})
