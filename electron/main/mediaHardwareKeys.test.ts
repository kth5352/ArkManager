import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/types/ipc'

const electronMocks = vi.hoisted(() => ({
  register: vi.fn(),
  unregister: vi.fn(),
  getAllWindows: vi.fn(() => [] as { isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }[]),
}))

vi.mock('electron', () => ({
  globalShortcut: { register: electronMocks.register, unregister: electronMocks.unregister },
  BrowserWindow: { getAllWindows: electronMocks.getAllWindows },
}))

function windowDouble() {
  return { isDestroyed: () => false, webContents: { send: vi.fn() } }
}

describe('setMediaHardwareKeysActive', () => {
  beforeEach(() => {
    vi.resetModules()
    electronMocks.register.mockClear()
    electronMocks.unregister.mockClear()
    electronMocks.getAllWindows.mockReturnValue([])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('registers all three media key accelerators when activated', async () => {
    const { setMediaHardwareKeysActive } = await import('./mediaHardwareKeys')
    setMediaHardwareKeysActive(true)

    const registeredKeys = electronMocks.register.mock.calls.map(([accelerator]) => accelerator)
    expect(registeredKeys.sort()).toEqual(
      ['MediaNextTrack', 'MediaPlayPause', 'MediaPreviousTrack'].sort()
    )
  })

  it('unregisters all three when deactivated after being active', async () => {
    const { setMediaHardwareKeysActive } = await import('./mediaHardwareKeys')
    setMediaHardwareKeysActive(true)
    electronMocks.register.mockClear()

    setMediaHardwareKeysActive(false)

    const unregisteredKeys = electronMocks.unregister.mock.calls.map(([accelerator]) => accelerator)
    expect(unregisteredKeys.sort()).toEqual(
      ['MediaNextTrack', 'MediaPlayPause', 'MediaPreviousTrack'].sort()
    )
  })

  it('is idempotent - activating twice in a row only registers once', async () => {
    const { setMediaHardwareKeysActive } = await import('./mediaHardwareKeys')
    setMediaHardwareKeysActive(true)
    setMediaHardwareKeysActive(true)

    expect(electronMocks.register).toHaveBeenCalledTimes(3)
  })

  it('is idempotent - deactivating while already inactive does nothing', async () => {
    const { setMediaHardwareKeysActive } = await import('./mediaHardwareKeys')
    setMediaHardwareKeysActive(false)

    expect(electronMocks.unregister).not.toHaveBeenCalled()
  })

  it('broadcasts the pressed action to every open, non-destroyed window', async () => {
    const win1 = windowDouble()
    const destroyedWin = { isDestroyed: () => true, webContents: { send: vi.fn() } }
    electronMocks.getAllWindows.mockReturnValue([win1, destroyedWin])

    const { setMediaHardwareKeysActive } = await import('./mediaHardwareKeys')
    setMediaHardwareKeysActive(true)
    const playPauseHandler = electronMocks.register.mock.calls.find(
      ([accelerator]) => accelerator === 'MediaPlayPause'
    )?.[1] as () => void
    playPauseHandler()

    expect(win1.webContents.send).toHaveBeenCalledWith(IPC_CHANNELS.MEDIA_HARDWARE_KEY, 'playpause')
    expect(destroyedWin.webContents.send).not.toHaveBeenCalled()
  })
})
