import { app, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC_CHANNELS, SetMediaThumbnailFromFileRequestSchema } from '../../../shared/types/ipc'
import { isAudioFile } from '../../../shared/isMediaFile'
import { MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE } from '../../../shared/mediaThumbnailErrors'
import { setMediaThumbnailOverride } from '../database/mediaThumbnailOverridesRepository'
import { listLibraries } from '../database/librariesRepository'
import { getSetting } from '../database/settingsRepository'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import {
  AudioCoverRestoreError,
  getAudioCoverWriteSupport,
  writeAudioCoverWithBackup,
} from '../media/audioCover'
import { isPathWithinAnyLibrary } from '../thumbnailProtocol'
import type { AppDatabase } from '../database/client'

function mediaThumbnailOverrideCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'media-thumbnail-overrides')
}

function toRendererSafeAudioCoverError(error: unknown): unknown {
  return error instanceof AudioCoverRestoreError
    ? new Error(MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE)
    : error
}

export function registerMediaThumbnailHandlers(db: AppDatabase): void {
  // Same one-shot trust pattern as GAME_USER_DATA_SET_CUSTOM_COVER_FROM_FILE
  // (gameUserDataHandlers.ts) - without pinning to whatever the native file
  // picker most recently actually returned, a compromised or buggy renderer
  // could pass any locally-readable path and get it copied into the app's
  // cache and re-served as this file's thumbnail, an arbitrary local-file-
  // read primitive.
  let lastPickedThumbnailPath: string | null = null

  ipcMain.handle(IPC_CHANNELS.MEDIA_THUMBNAIL_PICK_FILE, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    lastPickedThumbnailPath = result.filePaths[0]
    return lastPickedThumbnailPath
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_THUMBNAIL_SET_FROM_FILE, async (_event, payload: unknown) => {
    const { filePath, sourcePath } = SetMediaThumbnailFromFileRequestSchema.parse(payload)
    if (sourcePath !== lastPickedThumbnailPath) {
      throw new Error('선택된 파일이 아닙니다.')
    }
    lastPickedThumbnailPath = null
    const libraryPaths = listLibraries(db).map((library) => library.path)
    const mediaFolder = getSetting(db, 'media-folder')
    const allowedRoots = mediaFolder ? [...libraryPaths, mediaFolder] : libraryPaths
    if (!isPathWithinAnyLibrary(filePath, allowedRoots)) {
      throw new Error('Media thumbnail target is outside authorized roots.')
    }
    const buffer = await readFile(sourcePath)
    let warning: string | undefined
    if (isAudioFile(filePath) && getAudioCoverWriteSupport(filePath) === 'supported') {
      let result
      try {
        result = await writeAudioCoverWithBackup(filePath, sourcePath)
      } catch (error) {
        throw toRendererSafeAudioCoverError(error)
      }
      if (result.ok) return { mode: 'embedded' as const, warning: result.warning }
      warning = result.warning
    }
    const savedPath = await saveCustomCoverImage(mediaThumbnailOverrideCacheDir(), filePath, buffer)
    setMediaThumbnailOverride(db, filePath, savedPath)
    return { mode: 'override' as const, warning }
  })
}
