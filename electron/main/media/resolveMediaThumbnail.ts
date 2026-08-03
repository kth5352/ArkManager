import { access, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import { extractVideoFrame as defaultExtractVideoFrame } from './extractVideoFrame'
import { extractAudioArt as defaultExtractAudioArt } from './extractAudioArt'
import { findThumbnailPath as defaultFindThumbnailPath } from '../scanner/thumbnail'

export interface ResolveMediaThumbnailDeps {
  extractVideoFrame: (videoPath: string, outputPath: string) => Promise<boolean>
  extractAudioArt: (audioPath: string, outputPath: string) => Promise<boolean>
  findThumbnailPath: (folderPath: string) => Promise<string | null>
}

const defaultDeps: ResolveMediaThumbnailDeps = {
  extractVideoFrame: defaultExtractVideoFrame,
  extractAudioArt: defaultExtractAudioArt,
  findThumbnailPath: defaultFindThumbnailPath,
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Auto-extraction tier of the media-thumbnail priority chain (see
// docs/superpowers/specs/2026-08-03-media-thumbnails-design.md section 2) -
// the manual-override tier is checked by the protocol handler BEFORE this
// ever runs (mediaThumbnailProtocol.ts), not here. Caches to
// {cacheDir}/{hash of filePath}.webp via saveCustomCoverImage (the exact
// same cache-write helper game covers already use) - file existence on disk
// IS the cache, same design as thumb://'s own findThumbnailPath, so a
// second request for the same file skips straight past ffmpeg entirely.
export async function resolveMediaThumbnail(
  cacheDir: string,
  filePath: string,
  isVideo: boolean,
  deps: ResolveMediaThumbnailDeps = defaultDeps
): Promise<string | null> {
  const cachePath = join(cacheDir, `${keyToSafeDirName(filePath)}.webp`)
  if (await pathExists(cachePath)) return cachePath

  await mkdir(cacheDir, { recursive: true })
  const tempPath = join(cacheDir, `${keyToSafeDirName(filePath)}.tmp`)

  const extracted = isVideo
    ? await deps.extractVideoFrame(filePath, tempPath)
    : await deps.extractAudioArt(filePath, tempPath)

  if (extracted) {
    try {
      const buffer = await readFile(tempPath)
      return await saveCustomCoverImage(cacheDir, filePath, buffer)
    } catch {
      return null
    } finally {
      await rm(tempPath, { force: true })
    }
  }

  // Video has no directory-image tier - a frame from the video itself is
  // always the more relevant thumbnail when available, and a stray folder
  // image next to a video file is far less likely to actually be "this
  // video's cover" than the same is for a music folder (see spec section 1).
  if (!isVideo) {
    const directoryImage = await deps.findThumbnailPath(dirname(filePath))
    if (directoryImage) return directoryImage
  }

  return null
}
