import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { registerUpdateHandlers } from './updater'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
}))

const updaterMocks = vi.hoisted(() => ({
  autoDownload: false,
  autoInstallOnAppQuit: true,
  fullChangelog: false,
  checkForUpdates: vi.fn(),
  on: vi.fn(),
  quitAndInstall: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '1.1.0'), isPackaged: false },
  BrowserWindow: class {},
  ipcMain: { handle: electronMocks.handle },
}))

vi.mock('electron-updater', () => ({
  autoUpdater: updaterMocks,
}))

type RegisteredHandler = () => unknown

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

describe('UPDATE_INSTALL', () => {
  beforeEach(() => {
    electronMocks.handle.mockClear()
    updaterMocks.on.mockClear()
    updaterMocks.quitAndInstall.mockReset()
  })

  it('begins the intentional quit before installing the update', () => {
    const calls: string[] = []
    const beginQuit = vi.fn(() => calls.push('begin-quit'))
    updaterMocks.quitAndInstall.mockImplementation(() => calls.push('quit-and-install'))
    registerUpdateHandlers(() => null, beginQuit)

    registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()

    expect(calls).toEqual(['begin-quit', 'quit-and-install'])
    expect(beginQuit).toHaveBeenCalledOnce()
  })
})
