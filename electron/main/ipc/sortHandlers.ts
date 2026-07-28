import { ipcMain } from 'electron'
import { GetSortRequestSchema, IPC_CHANNELS, SetSortRequestSchema } from '../../../shared/types/ipc'
import { getSortPreference, setSortPreference } from '../database/sortPreferencesRepository'
import type { AppDatabase } from '../database/client'

export function registerSortHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.SORT_GET, (_event, payload: unknown) => {
    const { page } = GetSortRequestSchema.parse(payload)
    return getSortPreference(db, page) ?? null
  })

  ipcMain.handle(IPC_CHANNELS.SORT_SET, (_event, payload: unknown) => {
    const { page, field, direction } = SetSortRequestSchema.parse(payload)
    setSortPreference(db, page, field, direction)
  })
}
