import { ipcMain } from 'electron'
import { IPC_CHANNELS, MediaGetLyricsRequestSchema } from '../../../shared/types/ipc'
import { getSetting } from '../database/settingsRepository'
import { listLibraries } from '../database/librariesRepository'
import { readAdjacentLyrics } from '../media/lyrics'
import type { AppDatabase } from '../database/client'

export function registerMediaLyricsHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_GET_LYRICS, async (_event, payload: unknown) => {
    const { filePath } = MediaGetLyricsRequestSchema.parse(payload)
    const libraryPaths = listLibraries(db).map((library) => library.path)
    const mediaFolder = getSetting(db, 'media-folder')
    const allowedRoots = mediaFolder ? [...libraryPaths, mediaFolder] : libraryPaths
    return readAdjacentLyrics(filePath, allowedRoots)
  })
}
