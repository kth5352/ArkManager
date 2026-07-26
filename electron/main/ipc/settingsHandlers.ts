import { ipcMain } from 'electron'
import { GetSettingRequestSchema, IPC_CHANNELS, SetSettingRequestSchema } from '../../../shared/types/ipc'
import { getSetting, setSetting } from '../database/settingsRepository'
import type { AppDatabase } from '../database/client'

export function registerSettingsHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_event, payload: unknown) => {
    const { key } = GetSettingRequestSchema.parse(payload)
    return getSetting(db, key) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, payload: unknown) => {
    const { key, value } = SetSettingRequestSchema.parse(payload)
    setSetting(db, key, value)
  })

  // Synchronous read used only at renderer boot to apply the persisted theme
  // before first paint (avoids a flash of the wrong theme while the async
  // React Query fetch resolves). Scoped to the 'theme' key only.
  ipcMain.on(IPC_CHANNELS.SETTINGS_GET_SYNC, (event) => {
    event.returnValue = getSetting(db, 'theme') ?? null
  })
}
