import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../../shared/types/ipc'
import { createDbClient, type AppDatabase } from '../database/client'
import { setSetting } from '../database/settingsRepository'
import { registerSettingsHandlers } from './settingsHandlers'

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
})
