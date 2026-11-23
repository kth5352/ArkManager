import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { createMediaPlaylist, setMediaPlaylistTracks } from '../database/mediaPlaylistsRepository'
import { registerMpvHandlers } from './mpvHandlers'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  fromWebContents: vi.fn((): { webContents: object } | null => ({ webContents: {} })),
}))

const mpvProcessManagerMocks = vi.hoisted(() => ({
  setHostWindow: vi.fn(),
  loadFile: vi.fn(),
  onWorkerMessage: vi.fn(),
  getCurrentHostWindow: vi.fn(),
  getLoadState: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle, on: electronMocks.on },
  BrowserWindow: { fromWebContents: electronMocks.fromWebContents },
}))

vi.mock('../media/mpvProcessManager', () => mpvProcessManagerMocks)

type RegisteredHandler = (event: unknown, payload?: unknown) => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

describe('MPV_LOAD', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.on.mockClear()
    electronMocks.fromWebContents.mockClear()
    mpvProcessManagerMocks.setHostWindow.mockClear()
    mpvProcessManagerMocks.loadFile.mockClear()
    db = createDbClient(':memory:')
    addLibrary(db, 'Music', 'D:\\Music')
    registerMpvHandlers(db, () => null)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('rejects a path outside every registered library and trusted path', () => {
    // The handler throws synchronously (before any await), so calling it
    // throws inline here rather than returning a rejected promise - real
    // Electron IPC still converts a synchronous throw inside an
    // ipcMain.handle listener into a rejected invoke() promise on the
    // renderer side, this is just how the unit test has to observe it.
    expect(() =>
      registeredHandler(IPC_CHANNELS.MPV_LOAD)(
        { sender: {} },
        { filePath: 'C:\\Windows\\System32\\calc.exe', isVideo: false }
      )
    ).toThrow(/not within any registered library|trusted path/i)
    expect(mpvProcessManagerMocks.setHostWindow).not.toHaveBeenCalled()
    expect(mpvProcessManagerMocks.loadFile).not.toHaveBeenCalled()
  })

  it('loads a path inside a registered library', async () => {
    await registeredHandler(IPC_CHANNELS.MPV_LOAD)(
      { sender: {} },
      { filePath: 'D:\\Music\\song.mp3', isVideo: false }
    )
    expect(mpvProcessManagerMocks.setHostWindow).toHaveBeenCalledTimes(1)
    expect(mpvProcessManagerMocks.loadFile).toHaveBeenCalledWith(
      'D:\\Music\\song.mp3',
      1280,
      720,
      false,
      'D:\\Music\\song.mp3'
    )
  })

  it('loads a playlisted path outside every registered library', async () => {
    createMediaPlaylist(db, 'p1', 'My Playlist')
    setMediaPlaylistTracks(db, 'p1', [
      { path: 'C:\\Users\\external\\clip.mp4', name: 'clip.mp4' },
    ])

    await registeredHandler(IPC_CHANNELS.MPV_LOAD)(
      { sender: {} },
      { filePath: 'C:\\Users\\external\\clip.mp4', isVideo: true }
    )
    expect(mpvProcessManagerMocks.loadFile).toHaveBeenCalledWith(
      'C:\\Users\\external\\clip.mp4',
      1280,
      720,
      true,
      'C:\\Users\\external\\clip.mp4'
    )
  })

  it('rejects instead of silently no-oping when no window can host playback', () => {
    // registerMpvHandlers was given `() => null` as getMainWindow (see the
    // top-level beforeEach) - combined with fromWebContents returning
    // nothing here, there is genuinely no window to fall back to, the exact
    // rare mid-close race this handler used to swallow silently (resolving
    // the renderer's invoke() with undefined - indistinguishable from a
    // real success, leaving the caller waiting forever for frames that
    // could now never arrive). Throws synchronously (no await before the
    // check), same reason the "rejects a path outside..." test above uses
    // a sync throw assertion rather than .rejects.
    electronMocks.fromWebContents.mockReturnValueOnce(null)

    expect(() =>
      registeredHandler(IPC_CHANNELS.MPV_LOAD)(
        { sender: {} },
        { filePath: 'D:\\Music\\song.mp3', isVideo: false }
      )
    ).toThrow(/no window available/i)
    expect(mpvProcessManagerMocks.setHostWindow).not.toHaveBeenCalled()
    expect(mpvProcessManagerMocks.loadFile).not.toHaveBeenCalled()
  })
})

describe('MPV_BECOME_HOST', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.on.mockClear()
    electronMocks.fromWebContents.mockClear()
    mpvProcessManagerMocks.setHostWindow.mockClear()
    db = createDbClient(':memory:')
    registerMpvHandlers(db, () => null)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('re-points frame delivery to the calling window', async () => {
    await registeredHandler(IPC_CHANNELS.MPV_BECOME_HOST)({ sender: {} })
    expect(mpvProcessManagerMocks.setHostWindow).toHaveBeenCalledTimes(1)
  })

  it('rejects instead of silently no-oping when no window can host playback', () => {
    electronMocks.fromWebContents.mockReturnValueOnce(null)

    expect(() => registeredHandler(IPC_CHANNELS.MPV_BECOME_HOST)({ sender: {} })).toThrow(
      /no window available/i
    )
    expect(mpvProcessManagerMocks.setHostWindow).not.toHaveBeenCalled()
  })
})

describe('worker state-update relay', () => {
  const send = vi.fn()

  function relay(msg: unknown): void {
    const db = createDbClient(':memory:')
    mpvProcessManagerMocks.onWorkerMessage.mockClear()
    registerMpvHandlers(db, () => null)
    const listener = mpvProcessManagerMocks.onWorkerMessage.mock.calls[0][0] as (m: unknown) => void
    listener(msg)
    db.$client.close()
  }

  beforeEach(() => {
    send.mockClear()
    mpvProcessManagerMocks.getCurrentHostWindow.mockReturnValue({
      isDestroyed: () => false,
      webContents: { send },
    })
    // main has already moved on to generation B
    mpvProcessManagerMocks.getLoadState.mockReturnValue({
      generation: 9,
      requestedPath: 'B',
      isVideo: false,
    })
  })

  it('relays the identity carried by the state-update, not main current load state', () => {
    relay({
      type: 'state-update',
      isPlaying: true,
      currentTime: 3,
      duration: 10,
      error: null,
      mediaTitle: 'Title A',
      loadGeneration: 8,
      loadedPath: 'A',
    })
    expect(send).toHaveBeenCalledWith(
      IPC_CHANNELS.MPV_STATE_UPDATE,
      expect.objectContaining({ mediaTitle: 'Title A', loadGeneration: 8, loadedPath: 'A' })
    )
  })

  it('gives a message without load context a non-adoptable identity', () => {
    relay({ type: 'state-update', isPlaying: false, currentTime: 0, duration: null })
    expect(send).toHaveBeenCalledWith(
      IPC_CHANNELS.MPV_STATE_UPDATE,
      expect.objectContaining({ mediaTitle: null, loadGeneration: 0, loadedPath: null })
    )
  })

  it('relays the identity carried by init-failed', () => {
    relay({ type: 'init-failed', result: 'ERR', loadGeneration: 8, loadedPath: 'A' })
    expect(send).toHaveBeenCalledWith(
      IPC_CHANNELS.MPV_STATE_UPDATE,
      expect.objectContaining({ error: 'ERR', mediaTitle: null, loadGeneration: 8, loadedPath: 'A' })
    )
  })

  it('relays the identity carried by ended, not main current load state', () => {
    relay({ type: 'ended', loadGeneration: 8, loadedPath: 'A' })
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.MPV_ENDED, { loadGeneration: 8, loadedPath: 'A' })
  })

  it('gives an ended without load context a null path', () => {
    relay({ type: 'ended' })
    expect(send).toHaveBeenCalledWith(IPC_CHANNELS.MPV_ENDED, { loadGeneration: 0, loadedPath: null })
  })
})
