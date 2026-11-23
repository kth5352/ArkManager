import { app, dialog, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  GetMediaCoverInfoRequestSchema,
  IPC_CHANNELS,
  SetMediaThumbnailFromFileRequestSchema,
  type MediaCoverInfo,
} from '../../../shared/types/ipc'
import { isAudioFile } from '../../../shared/isMediaFile'
import { MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE } from '../../../shared/mediaThumbnailErrors'
import {
  getMediaThumbnailOverride,
  setMediaThumbnailOverride,
} from '../database/mediaThumbnailOverridesRepository'
import { computeMediaAllowedRoots, computeMediaTrustedPaths } from '../media/mediaTrustBoundary'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import { COVER_IMAGE_EXTENSIONS } from '../net/rasterImage'
import {
  AudioCoverRestoreError,
  getAudioCoverWriteSupport,
  writeAudioCoverWithBackup,
} from '../media/audioCover'
import { isPathExactlyTrusted, isPathWithinAnyLibrary } from '../thumbnailProtocol'
import { readOverrideCoverInfo } from '../media/overrideCoverInfo'
import { saveLargeOverrideCopy } from '../media/saveLargeOverride'
import type { MediaArtworkServices } from '../media/mediaArtworkServices'
import type { AppDatabase } from '../database/client'

function mediaThumbnailOverrideCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'media-thumbnail-overrides')
}

function toRendererSafeAudioCoverError(error: unknown): unknown {
  return error instanceof AudioCoverRestoreError
    ? new Error(MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE)
    : error
}

export function registerMediaThumbnailHandlers(
  db: AppDatabase,
  artwork: MediaArtworkServices
): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_GET_COVER_INFO, async (_event, payload: unknown) => {
    const { filePath } = GetMediaCoverInfoRequestSchema.parse(payload)
    // Same shape as a trusted track with no cover, so an out-of-boundary path is
    // indistinguishable; nothing but the boundary check runs before this.
    const inBoundary =
      isPathWithinAnyLibrary(filePath, computeMediaAllowedRoots(db)) ||
      isPathExactlyTrusted(filePath, computeMediaTrustedPaths(db))
    const version = `${artwork.cache.trackGeneration(filePath)}-${artwork.cache.workCoverGeneration()}`
    const none: MediaCoverInfo = { hasCover: false, accent: null, aspectRatio: null, version }
    if (!inBoundary) return none
    // A user override is what the protocol serves first, so it wins here too.
    const overridePath = getMediaThumbnailOverride(db, filePath)
    if (overridePath) {
      const overrideInfo = await readOverrideCoverInfo(overridePath)
      if (overrideInfo) return { hasCover: true, version, ...overrideInfo }
    }
    const art = await artwork.resolve(filePath)
    const info: MediaCoverInfo = art
      ? { hasCover: true, accent: art.info.accent, aspectRatio: art.info.aspectRatio, version }
      : none
    return info
  })

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
      filters: [{ name: '이미지', extensions: COVER_IMAGE_EXTENSIONS }],
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
    const allowedRoots = computeMediaAllowedRoots(db)
    const trustedPaths = computeMediaTrustedPaths(db)
    if (
      !isPathWithinAnyLibrary(filePath, allowedRoots) &&
      !isPathExactlyTrusted(filePath, trustedPaths)
    ) {
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
      if (result.ok) {
        await artwork.invalidateTrack(filePath)
        return { mode: 'embedded' as const, warning: result.warning }
      }
      warning = result.warning
    }
    const savedPath = await saveCustomCoverImage(mediaThumbnailOverrideCacheDir(), filePath, buffer)
    await saveLargeOverrideCopy(savedPath, buffer)
    setMediaThumbnailOverride(db, filePath, savedPath)
    await artwork.invalidateTrack(filePath)
    return { mode: 'override' as const, warning }
  })
}
