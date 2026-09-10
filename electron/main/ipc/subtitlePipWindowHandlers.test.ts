import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import type { AppDatabase } from '../database/client'
import { registerSubtitlePipWindowHandlers } from './subtitlePipWindowHandlers'

const mocks = vi.hoisted(() => ({
  createWindow: vi.fn(),
  handle: vi.fn(),
  on: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: Object.assign(mocks.createWindow, { getAllWindows: () => [] }),
  ipcMain: { handle: mocks.handle, on: mocks.on },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 2560, height: 1400 } }),
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 2560, height: 1400 } }],
  },
}))

// These tests exercise the window policy, not persistence. No user DB is opened.
vi.mock('../database/settingsRepository', () => ({
  getSetting: () => undefined,
  setSetting: vi.fn(),
}))

function createWindowDouble() {
  return Object.assign(new EventEmitter(), {
    setAlwaysOnTop: vi.fn(),
    focus: vi.fn(),
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    webContents: Object.assign(new EventEmitter(), { send: vi.fn() }),
  })
}

function openPip() {
  const registration = mocks.handle.mock.calls.find(
    ([channel]) => channel === IPC_CHANNELS.SUBTITLE_PIP_OPEN
  )
  if (!registration) throw new Error('Missing subtitle PIP open handler')
  registration[1]()
}

describe('subtitle PIP window layering', () => {
  let win: ReturnType<typeof createWindowDouble>

  beforeEach(() => {
    vi.clearAllMocks()
    win = createWindowDouble()
    mocks.createWindow.mockImplementation(function () {
      return win
    })
    registerSubtitlePipWindowHandlers({} as AppDatabase, () => null)
  })

  afterEach(() => {
    win.emit('closed')
  })

  it('requests the above-taskbar layer instead of the default floating layer', () => {
    openPip()
    // The real Electron API is unavailable in Vitest. Assert our API contract;
    // this does not claim that a particular game's live Z-order was verified.
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    // Setting the default layer first can already demote the native HWND behind
    // a non-topmost taskbar; request the intended layer in the first transition.
    expect(mocks.createWindow.mock.calls[0][0].alwaysOnTop).not.toBe(true)
  })

  it('keeps the configured singleton when the open command is repeated', () => {
    openPip()
    openPip()
    expect(mocks.createWindow).toHaveBeenCalledTimes(1)
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('applies the same layer to a newly-created PIP after closing', () => {
    openPip()
    win.emit('closed')
    win = createWindowDouble()
    openPip()
    expect(mocks.createWindow).toHaveBeenCalledTimes(2)
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
  })
})
