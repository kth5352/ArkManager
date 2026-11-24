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
    const currentVersion = (): string =>
      `${artwork.cache.trackGeneration(filePath)}-${artwork.cache.workCoverGeneration()}`
    const noCover = (v: string): MediaCoverInfo => ({
      hasCover: false,
      accent: null,
      aspectRatio: null,
      version: v,
    })
    if (!inBoundary) return noCover(currentVersion())
    // A user override is what the protocol serves first, so it wins here too.
    const overrideInfoFor = async (v: string): Promise<MediaCoverInfo | null> => {
      const overridePath = getMediaThumbnailOverride(db, filePath)
      if (!overridePath) return null
      const overrideInfo = await readOverrideCoverInfo(overridePath)
      return overrideInfo ? { hasCover: true, version: v, ...overrideInfo } : null
    }
    // The resolve can take long, and an override or a generation bump can land
    // while it runs. A result is only answered under the version it started
    // from; when the version moved, resolve again (bounded) instead of
    // wrapping the stale result in the new version.
    let result: MediaCoverInfo = noCover(currentVersion())
    for (let attempt = 0; attempt < 3; attempt++) {
      const version = currentVersion()
      const early = await overrideInfoFor(version)
      if (early) return early
      // A rejected resolve (encode I/O error, cache directory removed by
      // clear-cache mid-flight) answers "no cover" instead of failing the
      // query, which the renderer would otherwise keep showing as pending.
      let art: Awaited<ReturnType<typeof artwork.resolve>>
      try {
        art = await artwork.resolve(filePath)
      } catch {
        art = null
      }
      const late = await overrideInfoFor(currentVersion())
      if (late) return late
      result = art
        ? { hasCover: true, accent: art.info.accent, aspectRatio: art.info.aspectRatio, version }
        : noCover(version)
      if (currentVersion() === version) return result
    }
    return result
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
