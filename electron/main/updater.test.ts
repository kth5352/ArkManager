import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/types/ipc'
import { registerUpdateHandlers } from './updater'
import { createQuitLifecycle } from './windowCloseBehavior'

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
type UpdaterListener = (payload?: unknown) => void

function registeredHandler(channel: string): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  )
  if (!registration) throw new Error(`${channel} handler was not registered`)
  return registration[1] as RegisteredHandler
}

function updaterListener(eventName: string): UpdaterListener {
  const registration = updaterMocks.on.mock.calls.find(([event]) => event === eventName)
  if (!registration) throw new Error(`${eventName} listener was not registered`)
  return registration[1] as UpdaterListener
}

function markUpdateDownloaded(): void {
  updaterListener('update-downloaded')({ version: '1.1.1', releaseNotes: null })
}

describe('UPDATE_INSTALL', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    electronMocks.handle.mockClear()
    updaterMocks.on.mockClear()
    updaterMocks.quitAndInstall.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does nothing unless the main-process update state is downloaded', () => {
    const beginUpdateQuit = vi.fn(() => vi.fn())
    registerUpdateHandlers(() => null, beginUpdateQuit)
    updaterListener('checking-for-update')()

    registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()

    expect(beginUpdateQuit).not.toHaveBeenCalled()
    expect(updaterMocks.quitAndInstall).not.toHaveBeenCalled()
  })

  it('begins the intentional quit before installing the update', () => {
    const calls: string[] = []
    const beginUpdateQuit = vi.fn(() => {
      calls.push('begin-quit')
      return vi.fn()
    })
    updaterMocks.quitAndInstall.mockImplementation(() => calls.push('quit-and-install'))
    registerUpdateHandlers(() => null, beginUpdateQuit)
    markUpdateDownloaded()

    registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()

    expect(calls).toEqual(['begin-quit', 'quit-and-install'])
    expect(beginUpdateQuit).toHaveBeenCalledOnce()
  })

  it('rolls back updater quit admission when installation throws synchronously', () => {
    const installError = new Error('installer unavailable')
    const rollback = vi.fn()
    registerUpdateHandlers(
      () => null,
      () => rollback
    )
    markUpdateDownloaded()
    updaterMocks.quitAndInstall.mockImplementation(() => {
      throw installError
    })

    expect(() => registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()).toThrow(installError)
    expect(rollback).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rolls back a failed NSIS install before publishing its updater error', () => {
    const calls: string[] = []
    const rollback = vi.fn()
    rollback.mockImplementation(() => calls.push('rollback'))
    const mainWindow = {
      webContents: {
        send: vi.fn((_channel, status) => {
          if (status.state === 'error') calls.push('publish-error')
        }),
      },
    } as unknown as BrowserWindow
    registerUpdateHandlers(
      () => mainWindow,
      () => rollback
    )
    markUpdateDownloaded()

    registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()
    expect(rollback).not.toHaveBeenCalled()

    updaterListener('error')(new Error('NSIS install did not start'))

    expect(calls).toEqual(['rollback', 'publish-error'])
    expect(rollback).toHaveBeenCalledOnce()

    markUpdateDownloaded()
    registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()
    expect(updaterMocks.quitAndInstall).toHaveBeenCalledTimes(2)
  })

  it('keeps successful NSIS admission pending regardless of elapsed time', () => {
    const rollback = vi.fn()
    const beginUpdateQuit = vi.fn(() => rollback)
    registerUpdateHandlers(() => null, beginUpdateQuit)
    markUpdateDownloaded()

    registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()
    vi.advanceTimersByTime(60_000)

    expect(vi.getTimerCount()).toBe(0)
    expect(rollback).not.toHaveBeenCalled()

    registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()
    expect(beginUpdateQuit).toHaveBeenCalledOnce()
    expect(updaterMocks.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('ignores unrelated updater errors when no install admission is pending', () => {
    const beginUpdateQuit = vi.fn(() => vi.fn())
    registerUpdateHandlers(() => null, beginUpdateQuit)

    updaterListener('error')(new Error('update check failed'))

    expect(beginUpdateQuit).not.toHaveBeenCalled()
  })

  it('does not reopen quit after before-quit commits a pending install admission', () => {
    const cleanup = vi.fn()
    const lifecycle = createQuitLifecycle(cleanup)
    registerUpdateHandlers(() => null, lifecycle.beginUpdateQuit)
    markUpdateDownloaded()
    registeredHandler(IPC_CHANNELS.UPDATE_INSTALL)()

    lifecycle.commitQuit()
    updaterListener('error')(new Error('late update error'))

    expect(lifecycle.isQuitting()).toBe(true)
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
