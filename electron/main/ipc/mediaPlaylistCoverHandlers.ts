import { app, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  IPC_CHANNELS,
  SetMediaPlaylistCoverRequestSchema,
  ClearMediaPlaylistCoverRequestSchema,
} from '../../../shared/types/ipc'
import { setPlaylistCover, clearPlaylistCover } from '../database/mediaPlaylistsRepository'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import type { AppDatabase } from '../database/client'

function playlistCoverCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'playlist-covers')
}

// Independent one-shot trust-token pattern, deliberately not sharing
// mediaThumbnailHandlers.ts's own lastPickedThumbnailPath closure variable
// - a saved playlist is a DB record, not a media file, so this module owns
// its own pick/set pair rather than reaching into an unrelated module's
// private state (see this plan's Task 2 design note for the full reasoning).
export function registerMediaPlaylistCoverHandlers(db: AppDatabase): void {
  let lastPickedCoverPath: string | null = null

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_COVER_PICK_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    lastPickedCoverPath = result.filePaths[0]
    return lastPickedCoverPath
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_SET_COVER, async (_event, payload: unknown) => {
    const { playlistId, sourcePath } = SetMediaPlaylistCoverRequestSchema.parse(payload)
    if (sourcePath !== lastPickedCoverPath) {
      throw new Error('선택된 파일이 아닙니다.')
    }
    lastPickedCoverPath = null
    const buffer = await readFile(sourcePath)
    const savedPath = await saveCustomCoverImage(playlistCoverCacheDir(), playlistId, buffer)
    setPlaylistCover(db, playlistId, savedPath)
    return savedPath
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_PLAYLIST_CLEAR_COVER, (_event, payload: unknown) => {
    const { playlistId } = ClearMediaPlaylistCoverRequestSchema.parse(payload)
    clearPlaylistCover(db, playlistId)
  })
}
