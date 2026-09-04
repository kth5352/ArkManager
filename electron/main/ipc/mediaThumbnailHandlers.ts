import { app, dialog, ipcMain } from 'electron'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC_CHANNELS, SetMediaThumbnailFromFileRequestSchema } from '../../../shared/types/ipc'
import { isAudioFile } from '../../../shared/isMediaFile'
import { MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE } from '../../../shared/mediaThumbnailErrors'
import { setMediaThumbnailOverride } from '../database/mediaThumbnailOverridesRepository'
import { computeMediaAllowedRoots, computeMediaTrustedPaths } from '../media/mediaTrustBoundary'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import {
  AudioCoverRestoreError,
  getAudioCoverWriteSupport,
  writeAudioCoverWithBackup,
} from '../media/audioCover'
import { isPathExactlyTrusted, isPathWithinAnyLibrary } from '../thumbnailProtocol'
import { mediaThumbnailCacheDir } from '../mediaThumbnailProtocol'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import type { AppDatabase } from '../database/client'

function mediaThumbnailOverrideCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'media-thumbnail-overrides')
}

function toRendererSafeAudioCoverError(error: unknown): unknown {
  return error instanceof AudioCoverRestoreError
    ? new Error(MEDIA_THUMBNAIL_RECOVERY_BACKUP_RETAINED_ERROR_MESSAGE)
    : error
}

// resolveMediaThumbnail.ts's auto-extraction cache is keyed purely by
// filePath (existence on disk IS the cache - see its own comment), with
// nothing anywhere that ever invalidates one entry. Embedding a new cover
// directly into the audio file (below) doesn't touch that cache at all, so
// a track that already had ANY cached thumbnail - e.g. from the directory-
// image tier, which populates every track in a folder containing a
// cover.jpg even before any of them are individually edited - kept showing
// the stale image forever after an embed, recoverable only via Settings'
// "clear cache". force: true makes this a harmless no-op when nothing was
// cached yet for this file.
async function invalidateMediaThumbnailCache(filePath: string): Promise<void> {
  const cachePath = join(mediaThumbnailCacheDir(), `${keyToSafeDirName(filePath)}.webp`)
  await rm(cachePath, { force: true })
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
        await invalidateMediaThumbnailCache(filePath)
        return { mode: 'embedded' as const, warning: result.warning }
      }
      warning = result.warning
    }
    const savedPath = await saveCustomCoverImage(mediaThumbnailOverrideCacheDir(), filePath, buffer)
    setMediaThumbnailOverride(db, filePath, savedPath)
    return { mode: 'override' as const, warning }
  })
}
