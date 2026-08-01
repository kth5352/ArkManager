import { app, ipcMain } from 'electron'
import { ClearCacheRequestSchema, IPC_CHANNELS } from '../../../shared/types/ipc'
import { clearCache } from '../cache/clearCache'
import { clearAllGameMetadata } from '../database/gameMetadataRepository'
import type { AppDatabase } from '../database/client'

export function registerCacheHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.CACHE_CLEAR, async (_event, payload: unknown) => {
    const { deleteSaveBackups } = ClearCacheRequestSchema.parse(payload)
    clearAllGameMetadata(db)
    await clearCache(app.getPath('userData'), { deleteSaveBackups })
  })
}
