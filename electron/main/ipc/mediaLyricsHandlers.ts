import { ipcMain } from 'electron'
import { IPC_CHANNELS, MediaGetLyricsRequestSchema } from '../../../shared/types/ipc'
import { computeMediaAllowedRoots, computeMediaTrustedPaths } from '../media/mediaTrustBoundary'
import { readAdjacentLyrics } from '../media/lyrics'
import type { AppDatabase } from '../database/client'

export function registerMediaLyricsHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_GET_LYRICS, async (_event, payload: unknown) => {
    const { filePath } = MediaGetLyricsRequestSchema.parse(payload)
    const allowedRoots = computeMediaAllowedRoots(db)
    const trustedPaths = computeMediaTrustedPaths(db)
    return readAdjacentLyrics(filePath, allowedRoots, trustedPaths)
  })
}
