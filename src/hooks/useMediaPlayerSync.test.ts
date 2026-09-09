// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useMediaPlayerSync } from './useMediaPlayerSync'
import { useMediaPlayerStore } from '../stores/mediaPlayerStore'
import type { MediaSyncState } from '../../shared/types/ipc'
import type { MediaTrack } from '../stores/mediaPlayerStore'

const apiMocks = vi.hoisted(() => ({
  broadcastState: vi.fn(),
  requestStateSync: vi.fn(),
  onStateSyncCallback: null as ((state: MediaSyncState) => void) | null,
  onStateSyncRequestedCallback: null as (() => void) | null,
}))

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  apiMocks.broadcastState.mockClear()
  apiMocks.requestStateSync.mockClear()
  apiMocks.onStateSyncCallback = null
  apiMocks.onStateSyncRequestedCallback = null
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        media: {
          broadcastState: apiMocks.broadcastState,
          requestStateSync: apiMocks.requestStateSync,
          onStateSync: (cb: (state: MediaSyncState) => void) => {
            apiMocks.onStateSyncCallback = cb
            return vi.fn()
          },
          onStateSyncRequested: (cb: () => void) => {
            apiMocks.onStateSyncRequestedCallback = cb
            return vi.fn()
          },
        },
      },
    },
  })
  // Reset the store to a known baseline between tests - it's a module
  // singleton, so state leaks across tests otherwise.
  useMediaPlayerStore.setState({
    playlist: [],
    currentIndex: null,
    isPlaying: false,
    volume: 1,
    previousVolume: 1,
    repeatMode: 'off',
    shuffleMode: false,
    shuffleOrder: [],
    shufflePosition: 0,
    isDetached: false,
    mediaExpanded: false,
    sidebarActiveTab: 'playlists',
    mediaFullscreenBarHeight: 0,
  })
})

let container: HTMLDivElement
let root: ReturnType<typeof createRoot>

function Harness({ requestInitialStateOnMount }: { requestInitialStateOnMount?: boolean }) {
  useMediaPlayerSync({ requestInitialStateOnMount })
  return null
}

async function mount(requestInitialStateOnMount = false): Promise<void> {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root.render(createElement(Harness, { requestInitialStateOnMount }))
  })
}

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

function track(i: number): MediaTrack {
  return { path: `D:\\Media\\track-${i}.mp3`, name: `Track ${i}` }
}

it('does not broadcast for UI-only state changes not present in the sync DTO', async () => {
  await mount()
  apiMocks.broadcastState.mockClear()

  await act(async () => {
    useMediaPlayerStore.getState().setMediaExpanded(true)
    useMediaPlayerStore.getState().setSidebarActiveTab('queue')
    useMediaPlayerStore.getState().setMediaFullscreenBarHeight(64)
  })

  expect(apiMocks.broadcastState).not.toHaveBeenCalled()
})

it('broadcasts exactly once for each real sync-relevant change: volume, playing, track, queue, repeat, shuffle, detach', async () => {
  await mount()
  // Seed a 2-track queue via the real playNow action, outside the measured
  // segment for each individual scenario below.
  await act(async () => {
    useMediaPlayerStore.getState().playNow(track(0), [track(0), track(1)])
  })
  apiMocks.broadcastState.mockClear()

  await act(async () => useMediaPlayerStore.getState().setVolume(0.5))
  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(1)

  // playNow above already set isPlaying: true, so toggle it to a genuinely
  // different value - calling setPlaying(true) again would be a no-op
  // change, and sameMediaSyncState correctly wouldn't broadcast that (which
  // is the behavior this whole test suite exists to verify, not a bug to
  // work around).
  await act(async () => useMediaPlayerStore.getState().setPlaying(false))
  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(2)

  await act(async () => useMediaPlayerStore.getState().next())
  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(3)

  await act(async () => useMediaPlayerStore.getState().reorderPlaylist(0, 1))
  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(4)

  await act(async () => useMediaPlayerStore.getState().cycleRepeatMode())
  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(5)

  await act(async () => useMediaPlayerStore.getState().toggleShuffle())
  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(6)

  await act(async () => useMediaPlayerStore.getState().setDetached(true))
  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(7)
})

it('does not broadcast when applying a remote-received sync (no ping-pong)', async () => {
  await mount()
  apiMocks.broadcastState.mockClear()

  await act(async () => {
    apiMocks.onStateSyncCallback!({
      playlist: [track(0)],
      currentIndex: 0,
      isPlaying: true,
      volume: 0.7,
      previousVolume: 1,
      repeatMode: 'off',
      shuffleMode: false,
      shuffleOrder: [],
      shufflePosition: 0,
      isDetached: false,
    })
  })

  expect(apiMocks.broadcastState).not.toHaveBeenCalled()
  // The applied state genuinely landed in the store, not silently dropped.
  expect(useMediaPlayerStore.getState().volume).toBe(0.7)
})

it('the applyingRemote guard releases even if setState throws, via try/finally', async () => {
  await mount()
  // Force setState to throw once, simulating a malformed remote payload -
  // the guard must still release afterward so this window's OWN future
  // changes keep broadcasting.
  const setStateSpy = vi.spyOn(useMediaPlayerStore, 'setState').mockImplementationOnce(() => {
    throw new Error('simulated malformed remote state')
  })
  await act(async () => {
    expect(() =>
      apiMocks.onStateSyncCallback!({
        playlist: [],
        currentIndex: null,
        isPlaying: false,
        volume: 1,
        previousVolume: 1,
        repeatMode: 'off',
        shuffleMode: false,
        shuffleOrder: [],
        shufflePosition: 0,
        isDetached: false,
      })
    ).toThrow('simulated malformed remote state')
  })
  setStateSpy.mockRestore()

  apiMocks.broadcastState.mockClear()
  await act(async () => useMediaPlayerStore.getState().setVolume(0.3))
  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(1)
})

it('broadcasts once in response to another window requesting state, unconditionally (not gated by equality)', async () => {
  await mount()
  apiMocks.broadcastState.mockClear()

  await act(async () => {
    apiMocks.onStateSyncRequestedCallback!()
  })

  expect(apiMocks.broadcastState).toHaveBeenCalledTimes(1)
})

it('requests initial state on mount only when requestInitialStateOnMount is true', async () => {
  await mount(true)
  expect(apiMocks.requestStateSync).toHaveBeenCalledTimes(1)
})

it('does not request initial state on mount by default', async () => {
  await mount(false)
  expect(apiMocks.requestStateSync).not.toHaveBeenCalled()
})

it('stops broadcasting after unmount (subscription cleaned up)', async () => {
  await mount()
  apiMocks.broadcastState.mockClear()
  await act(async () => root.unmount())
  container.remove()

  useMediaPlayerStore.getState().setVolume(0.9)
  expect(apiMocks.broadcastState).not.toHaveBeenCalled()
})
