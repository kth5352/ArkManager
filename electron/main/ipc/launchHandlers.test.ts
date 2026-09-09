import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { NO_LAUNCH_CONFIG_ERROR_MESSAGE } from '../../../shared/launchErrors'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { setLaunchConfig } from '../database/gameUserDataRepository'
import { registerLaunchHandlers } from './launchHandlers'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  showOpenDialog: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
}))

const launchGameMock = vi.hoisted(() => vi.fn())
vi.mock('../launch/launchGame', () => ({ launchGame: launchGameMock }))

type RegisteredHandler = (_event: unknown, payload?: unknown) => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

describe('LAUNCH_GAME library-boundary re-check (D4 follow-up)', () => {
  let db: AppDatabase
  const libraryRoot = 'C:\\games\\library'

  beforeEach(() => {
    electronMocks.handle.mockClear()
    launchGameMock.mockReset()
    launchGameMock.mockResolvedValue({ sessionMs: 1234 })
    db = createDbClient(':memory:')
    addLibrary(db, 'Library', libraryRoot)
    registerLaunchHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('launches when the stored executablePath is genuinely under a registered library', async () => {
    setLaunchConfig(db, 'RJ01111111', 'code', {
      executablePath: join(libraryRoot, 'RJ01111111', 'game.exe'),
      launchMode: 'normal',
    })

    const result = await registeredHandler(IPC_CHANNELS.LAUNCH_GAME)(
      {},
      { identifier: { code: { value: 'RJ01111111', type: 'RJ' }, path: '' } }
    )

    expect(result).toEqual({ sessionMs: 1234 })
    expect(launchGameMock).toHaveBeenCalledTimes(1)
  })

  // D4 review follow-up: isLaunchConfig (gameUserDataRepository.ts) only
  // validates that executablePath is a STRING, not that it still points
  // under a registered library - a corrupted or manually-edited DB row
  // could hold a well-formed launchConfig pointing anywhere. This proves
  // LAUNCH_GAME itself re-checks the library boundary on every launch, not
  // just when LAUNCH_SET_CONFIG first wrote it (see launchHandlers.ts).
  it('refuses to launch a well-formed but out-of-library executablePath, without ever calling launchGame', async () => {
    setLaunchConfig(db, 'RJ02222222', 'code', {
      executablePath: 'C:\\Windows\\System32\\notepad.exe',
      launchMode: 'normal',
    })

    await expect(
      registeredHandler(IPC_CHANNELS.LAUNCH_GAME)(
        {},
        { identifier: { code: { value: 'RJ02222222', type: 'RJ' }, path: '' } }
      )
    ).rejects.toThrow(NO_LAUNCH_CONFIG_ERROR_MESSAGE)

    expect(launchGameMock).not.toHaveBeenCalled()
  })

  it('still throws the existing no-config error when no launchConfig was ever set', async () => {
    await expect(
      registeredHandler(IPC_CHANNELS.LAUNCH_GAME)(
        {},
        { identifier: { code: { value: 'RJ03333333', type: 'RJ' }, path: '' } }
      )
    ).rejects.toThrow(NO_LAUNCH_CONFIG_ERROR_MESSAGE)

    expect(launchGameMock).not.toHaveBeenCalled()
  })
})
