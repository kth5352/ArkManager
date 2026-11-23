import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { setSetting } from '../database/settingsRepository'
import { registerSettingsHandlers } from './settingsHandlers'
import { rememberPickedPath, resetPickedPathsForTests } from './pickedPaths'
import { addLibrary } from '../database/librariesRepository'

const electronMocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: electronMocks,
}))

type RegisteredHandler = (_event: unknown, payload: unknown) => unknown

function getSettingHandler(): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([channel]) => channel === IPC_CHANNELS.SETTINGS_GET
  )
  if (!registration) throw new Error('settings get handler was not registered')
  return registration[1] as RegisteredHandler
}

function setSettingHandler(): RegisteredHandler {
  const registration = electronMocks.handle.mock.calls.find(
    ([channel]) => channel === IPC_CHANNELS.SETTINGS_SET
  )
  if (!registration) throw new Error('settings set handler was not registered')
  return registration[1] as RegisteredHandler
}

describe('SETTINGS_GET', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.on.mockClear()
    db = createDbClient(':memory:')
    registerSettingsHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  it('returns null for a corrupted external provider enabled value', () => {
    setSetting(db, 'external-metadata-provider-enabled', 'not-a-boolean')

    expect(getSettingHandler()({}, { key: 'external-metadata-provider-enabled' })).toBeNull()
  })

  it('returns null for an invalid window close behavior value', () => {
    setSetting(db, 'window-close-behavior', 'invalid')

    expect(getSettingHandler()({}, { key: 'window-close-behavior' })).toBeNull()
  })

  it('returns null for an invalid media view mode value', () => {
    setSetting(db, 'media-view-mode', 'card')

    expect(getSettingHandler()({}, { key: 'media-view-mode' })).toBeNull()
  })

  it('returns null for a non-numeric media volume value', () => {
    setSetting(db, 'media-volume', 'not-a-number')

    expect(getSettingHandler()({}, { key: 'media-volume' })).toBeNull()
  })

  it('returns null for a media volume value outside 0-1', () => {
    setSetting(db, 'media-volume', '1.5')

    expect(getSettingHandler()({}, { key: 'media-volume' })).toBeNull()
  })

  it('returns a valid media volume value as-is', () => {
    setSetting(db, 'media-volume', '0.5')

    expect(getSettingHandler()({}, { key: 'media-volume' })).toBe('0.5')
  })

  it('returns null for non-JSON equalizer bands', () => {
    setSetting(db, 'media-equalizer-bands', 'not-json')

    expect(getSettingHandler()({}, { key: 'media-equalizer-bands' })).toBeNull()
  })

  it('returns null for equalizer bands of the wrong length', () => {
    setSetting(db, 'media-equalizer-bands', '[0,0,0]')

    expect(getSettingHandler()({}, { key: 'media-equalizer-bands' })).toBeNull()
  })

  it('returns null for equalizer bands containing a non-number', () => {
    setSetting(db, 'media-equalizer-bands', '[0,0,"3",0,0]')

    expect(getSettingHandler()({}, { key: 'media-equalizer-bands' })).toBeNull()
  })

  it('returns null for equalizer bands outside the -12..12 dB range', () => {
    setSetting(db, 'media-equalizer-bands', '[0,0,50,0,0]')

    expect(getSettingHandler()({}, { key: 'media-equalizer-bands' })).toBeNull()
  })

  it('returns valid equalizer bands re-serialized canonically', () => {
    setSetting(db, 'media-equalizer-bands', '[6, 4, 0, 0, -2]')

    expect(getSettingHandler()({}, { key: 'media-equalizer-bands' })).toBe('[6,4,0,0,-2]')
  })
})

// index.ts's own onSettingChanged wiring (rebuilding the native application
// menu when 'locale' changes - see menuLocalization.ts) depends on this
// callback actually firing with the exact (key, value) pair just written. A
// live user found that changing Settings > language never touched the menu
// bar at all before this callback existed.
describe('SETTINGS_SET onSettingChanged callback', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.on.mockClear()
    db = createDbClient(':memory:')
  })

  afterEach(() => {
    db.$client.close()
  })

  it('fires with the key and value after a setting is persisted', () => {
    const onSettingChanged = vi.fn()
    registerSettingsHandlers(db, onSettingChanged)

    setSettingHandler()({}, { key: 'locale', value: 'ja' })

    expect(onSettingChanged).toHaveBeenCalledWith('locale', 'ja')
    expect(getSettingHandler()({}, { key: 'locale' })).toBe('ja')
  })

  it('does not throw when no callback is provided', () => {
    registerSettingsHandlers(db)

    expect(() => setSettingHandler()({}, { key: 'theme', value: 'dark' })).not.toThrow()
  })
})

// SETTINGS_SET used to accept any string for every key. Two keys carry real
// authority: 'locale-emulator-path' is spawn()ed when a game runs in Locale
// Emulator mode, and 'media-folder' widens the media trust boundary
// (playback, thumbnails, embedding cover art into audio files). A
// compromised renderer must not be able to point either anywhere it likes.
describe('SETTINGS_SET write validation', () => {
  let db: AppDatabase

  beforeEach(() => {
    electronMocks.handle.mockClear()
    electronMocks.on.mockClear()
    resetPickedPathsForTests()
    db = createDbClient(':memory:')
    registerSettingsHandlers(db)
  })

  afterEach(() => {
    db.$client.close()
  })

  const LE_PATH = 'D:\\Tools\\LE\\LEProc.exe'

  it('rejects a locale-emulator-path that was not just chosen in the native picker', () => {
    expect(() =>
      setSettingHandler()(
        {},
        { key: 'locale-emulator-path', value: 'C:\\Windows\\System32\\cmd.exe' }
      )
    ).toThrow()
    expect(getSettingHandler()({}, { key: 'locale-emulator-path' })).toBeNull()
  })

  it('accepts the locale-emulator-path the picker just returned, only once', () => {
    rememberPickedPath('locale-emulator', LE_PATH)

    setSettingHandler()({}, { key: 'locale-emulator-path', value: LE_PATH })
    expect(getSettingHandler()({}, { key: 'locale-emulator-path' })).toBe(LE_PATH)

    expect(() => setSettingHandler()({}, { key: 'locale-emulator-path', value: LE_PATH })).toThrow()
  })

  it('rejects a picked locale-emulator-path that is not an .exe', () => {
    rememberPickedPath('locale-emulator', 'D:\\Tools\\run.bat')
    expect(() =>
      setSettingHandler()({}, { key: 'locale-emulator-path', value: 'D:\\Tools\\run.bat' })
    ).toThrow()
  })

  it('always allows clearing locale-emulator-path (reset to auto-detect)', () => {
    expect(() => setSettingHandler()({}, { key: 'locale-emulator-path', value: '' })).not.toThrow()
  })

  it('rejects a media-folder outside every library that was not just picked', () => {
    expect(() => setSettingHandler()({}, { key: 'media-folder', value: 'C:\\' })).toThrow()
  })

  it('accepts a media-folder inside a registered library (ASMR folder playback)', () => {
    addLibrary(db, 'Lib', 'D:\\Games')
    expect(() =>
      setSettingHandler()({}, { key: 'media-folder', value: 'D:\\Games\\RJ01234567 ASMR' })
    ).not.toThrow()
  })

  it('accepts a media-folder the user just picked in the native folder picker', () => {
    rememberPickedPath('folder', 'E:\\Music')
    expect(() => setSettingHandler()({}, { key: 'media-folder', value: 'E:\\Music' })).not.toThrow()
    expect(getSettingHandler()({}, { key: 'media-folder' })).toBe('E:\\Music')
  })
})
