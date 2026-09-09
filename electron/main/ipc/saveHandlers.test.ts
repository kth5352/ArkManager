import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { getGameUserData } from '../database/gameUserDataRepository'
import { registerSaveHandlers } from './saveHandlers'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'C:\\ArkManagerTest') },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: { handle: electronMocks.handle },
  shell: { showItemInFolder: vi.fn() },
}))

type RegisteredHandler = (_event: unknown, payload?: unknown) => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

// Lowercase, matching normalizeLibraryPath's own canonical form - the
// stored lookup key is normalized on write (see resolveGameEntryKey), so a
// differently-cased lookup here would silently miss the row.
const identifier = { code: null, path: 'd:\\games\\mygame' }

describe('SAVE_SET_PATH pinning', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.showOpenDialog.mockReset()
    db = createDbClient(':memory:')
    registerSaveHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('accepts a path that was actually just returned by the folder picker', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\Users\\external\\AppData\\MyGameSave'],
    })
    const picked = await registeredHandler(IPC_CHANNELS.SAVE_PICK_FOLDER)({}, { startPath: null })
    expect(picked).toBe('C:\\Users\\external\\AppData\\MyGameSave')

    await registeredHandler(IPC_CHANNELS.SAVE_SET_PATH)(
      {},
      { identifier, savePath: 'C:\\Users\\external\\AppData\\MyGameSave' }
    )

    expect(getGameUserData(db, 'd:\\games\\mygame')?.savePath).toBe(
      'C:\\Users\\external\\AppData\\MyGameSave'
    )
  })

  it('rejects a savePath that was never returned by the folder picker', () => {
    // No SAVE_PICK_FOLDER call at all - a compromised or buggy renderer
    // calling SAVE_SET_PATH directly with an arbitrary path (e.g. a system
    // folder) must not be able to set it, since SAVE_RESTORE_SNAPSHOT would
    // later write snapshot content into whatever this path is.
    //
    // SAVE_SET_PATH's handler throws synchronously (before any await), so
    // the rejection must be asserted via a wrapping function, not `.rejects`
    // (which requires the call itself to not throw but return a rejecting
    // promise).
    expect(() =>
      registeredHandler(IPC_CHANNELS.SAVE_SET_PATH)(
        {},
        { identifier, savePath: 'C:\\Windows\\System32' }
      )
    ).toThrow(/선택된 폴더가 아닙니다/)

    expect(getGameUserData(db, 'd:\\games\\mygame')?.savePath ?? null).toBeNull()
  })

  it('is one-shot - a second SET_PATH call with the same picked path is rejected', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:\\Users\\external\\AppData\\MyGameSave'],
    })
    await registeredHandler(IPC_CHANNELS.SAVE_PICK_FOLDER)({}, { startPath: null })
    await registeredHandler(IPC_CHANNELS.SAVE_SET_PATH)(
      {},
      { identifier, savePath: 'C:\\Users\\external\\AppData\\MyGameSave' }
    )

    expect(() =>
      registeredHandler(IPC_CHANNELS.SAVE_SET_PATH)(
        {},
        { identifier, savePath: 'C:\\Users\\external\\AppData\\MyGameSave' }
      )
    ).toThrow(/선택된 폴더가 아닙니다/)
  })
})
