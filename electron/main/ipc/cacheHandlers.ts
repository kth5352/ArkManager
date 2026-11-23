import { app, ipcMain } from 'electron'
import { ClearCacheRequestSchema, IPC_CHANNELS } from '../../../shared/types/ipc'
import { clearCache } from '../cache/clearCache'
import { clearAllGameMetadata } from '../database/gameMetadataRepository'
import type { AppDatabase } from '../database/client'
import type { MediaArtworkServices } from '../media/mediaArtworkServices'

export function registerCacheHandlers(
  db: AppDatabase,
  artwork: Pick<MediaArtworkServices, 'bumpWorkCover'>
): void {
  ipcMain.handle(IPC_CHANNELS.CACHE_CLEAR, async (_event, payload: unknown) => {
    const { deleteSaveBackups } = ClearCacheRequestSchema.parse(payload)
    clearAllGameMetadata(db)
    try {
      await clearCache(app.getPath('userData'), { deleteSaveBackups })
    } finally {
      // Artwork files may be (partly) gone: new version so open views refetch.
      await artwork.bumpWorkCover()
    }
  })
}
