import { ipcMain } from 'electron'
import {
  GetSettingRequestSchema,
  IPC_CHANNELS,
  SetSettingRequestSchema,
  ThemeSchema,
} from '../../../shared/types/ipc'
import { getSetting, setSetting } from '../database/settingsRepository'
import type { AppDatabase } from '../database/client'

// Validates a raw DB string against ThemeSchema before it reaches the
// renderer. A corrupted or manually-edited DB row would otherwise silently
// produce a value that's typed as Theme but isn't actually 'light' | 'dark' -
// this self-heals to null (treated as "no persisted value" / default theme)
// instead of propagating the bad value.
function parseStoredTheme(raw: string | undefined): 'light' | 'dark' | null {
  if (raw === undefined) return null
  const result = ThemeSchema.safeParse(raw)
  return result.success ? result.data : null
}

export function registerSettingsHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    return parseStoredTheme(getSetting(db, key))
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, payload: unknown) => {
    const { key, value } = SetSettingRequestSchema.parse(payload)
    setSetting(db, key, value)
  })

  // Synchronous read used only at renderer boot to apply the persisted theme
  // before first paint (avoids a flash of the wrong theme while the async
  // React Query fetch resolves). Scoped to the 'theme' key only.
  ipcMain.on(IPC_CHANNELS.SETTINGS_GET_SYNC, (event) => {
    event.returnValue = parseStoredTheme(getSetting(db, 'theme'))
  })
}
