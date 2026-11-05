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
  showMessageBox: vi.fn(),
  stat: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({ stat: electronMocks.stat }))

vi.mock('electron', () => ({
  ipcMain: { handle: electronMocks.handle },
  dialog: { showMessageBox: electronMocks.showMessageBox },
  BrowserWindow: { fromWebContents: () => null },
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
    electronMocks.showMessageBox.mockReset().mockResolvedValue({ response: 0 })
    electronMocks.stat.mockReset().mockResolvedValue({ isDirectory: () => false })
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
    it('opens a folder within a registered library without any prompt', async () => {
      electronMocks.stat.mockResolvedValue({ isDirectory: () => true })
      await registeredHandler(IPC_CHANNELS.SHELL_OPEN_PATH)({}, { path: 'D:\\Games\\MyGame' })

      expect(electronMocks.showMessageBox).not.toHaveBeenCalled()
      expect(electronMocks.openPath).toHaveBeenCalledWith('D:\\Games\\MyGame')
    })

    it('opens a harmless document without a prompt', async () => {
      await registeredHandler(IPC_CHANNELS.SHELL_OPEN_PATH)(
        {},
        { path: 'D:\\Games\\MyGame\\readme.txt' }
      )

      expect(electronMocks.showMessageBox).not.toHaveBeenCalled()
      expect(electronMocks.openPath).toHaveBeenCalledWith('D:\\Games\\MyGame\\readme.txt')
    })

    it('asks before running an executable file and does nothing when the user cancels', async () => {
      electronMocks.showMessageBox.mockResolvedValue({ response: 0 })
      await registeredHandler(IPC_CHANNELS.SHELL_OPEN_PATH)(
        {},
        { path: 'D:\\Games\\MyGame\\game.exe' }
      )

      expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1)
      expect(electronMocks.openPath).not.toHaveBeenCalled()
    })

    it('runs an executable file only after the user confirms', async () => {
      electronMocks.showMessageBox.mockResolvedValue({ response: 1 })
      await registeredHandler(IPC_CHANNELS.SHELL_OPEN_PATH)(
        {},
        { path: 'D:\\Games\\MyGame\\game.exe' }
      )

      expect(electronMocks.openPath).toHaveBeenCalledWith('D:\\Games\\MyGame\\game.exe')
    })

    it('rejects a path containing a NUL byte', async () => {
      await expect(
        registeredHandler(IPC_CHANNELS.SHELL_OPEN_PATH)({}, { path: 'D:\\Games\\a\0.txt' })
      ).rejects.toThrow()
      expect(electronMocks.openPath).not.toHaveBeenCalled()
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
