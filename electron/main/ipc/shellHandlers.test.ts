import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { addLibrary } from '../database/librariesRepository'
import { setSavePath } from '../database/gameUserDataRepository'
import { registerShellHandlers } from './shellHandlers'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  openExternal: vi.fn(),
  openPath: vi.fn(),
  showItemInFolder: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
  shell: {
    openExternal: electronMocks.openExternal,
    openPath: electronMocks.openPath,
    showItemInFolder: electronMocks.showItemInFolder,
  },
}))

type RegisteredHandler = (_event: unknown, payload?: unknown) => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

describe('shellHandlers', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.openExternal.mockReset()
    electronMocks.openPath.mockReset().mockResolvedValue('')
    electronMocks.showItemInFolder.mockReset()
    db = createDbClient(':memory:')
    addLibrary(db, 'Games', 'D:\\Games')
    registerShellHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  describe(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER, () => {
    it('reveals a path within a registered library', async () => {
      await registeredHandler(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER)(
        {},
        { path: 'D:\\Games\\MyGame\\game.exe' }
      )

      expect(electronMocks.showItemInFolder).toHaveBeenCalledWith('D:\\Games\\MyGame\\game.exe')
    })

    it('reveals a configured save path outside every registered library', async () => {
      setSavePath(db, 'D:\\Games\\MyGame', 'path', 'C:\\Users\\external\\AppData\\MyGameSave')

      await registeredHandler(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER)(
        {},
        { path: 'C:\\Users\\external\\AppData\\MyGameSave' }
      )

      expect(electronMocks.showItemInFolder).toHaveBeenCalledWith(
        'C:\\Users\\external\\AppData\\MyGameSave'
      )
    })

    it('rejects a path that is neither within a library nor a configured save path', () => {
      // This handler throws synchronously (before any await), so the
      // rejection must be asserted via a wrapping function, not
      // `.rejects` (which requires the call itself to not throw but
      // return a rejecting promise).
      expect(() =>
        registeredHandler(IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER)(
          {},
          { path: 'C:\\Users\\external\\Documents\\secret.txt' }
        )
      ).toThrow(/outside registered libraries/i)
      expect(electronMocks.showItemInFolder).not.toHaveBeenCalled()
    })
  })

  describe(IPC_CHANNELS.SHELL_OPEN_PATH, () => {
    it('opens a path within a registered library', async () => {
      await registeredHandler(IPC_CHANNELS.SHELL_OPEN_PATH)(
        {},
        { path: 'D:\\Games\\MyGame\\game.exe' }
      )

      expect(electronMocks.openPath).toHaveBeenCalledWith('D:\\Games\\MyGame\\game.exe')
    })

    it('rejects a path outside every registered library, even a configured save path', async () => {
      // SHELL_OPEN_PATH actually launches the target with its default
      // handler (potential code execution), unlike SHELL_SHOW_ITEM_IN_FOLDER
      // which only reveals it in the OS file explorer - so it deliberately
      // does NOT get the same save-path allowance.
      setSavePath(db, 'D:\\Games\\MyGame', 'path', 'C:\\Users\\external\\AppData\\MyGameSave')

      await expect(
        registeredHandler(IPC_CHANNELS.SHELL_OPEN_PATH)(
          {},
          { path: 'C:\\Users\\external\\AppData\\MyGameSave' }
        )
      ).rejects.toThrow(/outside registered libraries/i)
      expect(electronMocks.openPath).not.toHaveBeenCalled()
    })
  })
})
