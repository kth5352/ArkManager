import { access, mkdir, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { isLikelyMpegTsStream as defaultIsLikelyMpegTsStream } from './isLikelyMpegTsStream'
import { remuxMpegTsToMp4 as defaultRemuxMpegTsToMp4 } from './remuxMpegTsToMp4'

export interface ResolvePlayableMediaPathDeps {
  isLikelyMpegTsStream: (filePath: string) => Promise<boolean>
  remuxMpegTsToMp4: (filePath: string, outputPath: string) => Promise<boolean>
}

const defaultDeps: ResolvePlayableMediaPathDeps = {
  isLikelyMpegTsStream: defaultIsLikelyMpegTsStream,
  remuxMpegTsToMp4: defaultRemuxMpegTsToMp4,
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Returns the path mediaProtocol.ts should actually stream bytes from for
// `filePath` - normally `filePath` itself unchanged, but if the file is a
// raw MPEG-TS stream saved under a misleading extension (Chromium's
// <video> refuses to demux those directly - see
// docs/superpowers/specs/2026-09-02-mp4-mpegts-remux-design.md), a
// remuxed (not re-encoded) copy cached at {cacheDir}/{hash}.mp4. File
// existence on disk IS the cache, same design as resolveMediaThumbnail.ts -
// a second request for the same file skips straight past both the
// detection check and ffmpeg entirely.
export async function resolvePlayableMediaPath(
  cacheDir: string,
  filePath: string,
  deps: ResolvePlayableMediaPathDeps = defaultDeps
): Promise<string> {
  const cachePath = join(cacheDir, `${keyToSafeDirName(filePath)}.mp4`)
  if (await pathExists(cachePath)) return cachePath

  const isMpegTs = await deps.isLikelyMpegTsStream(filePath)
  if (!isMpegTs) return filePath

  await mkdir(cacheDir, { recursive: true })
  // Unique per call (not just per filePath) so two concurrent requests for
  // the same file - e.g. an initial Range request and a seek arriving
  // moments later - never share one temp filename, same reasoning as
  // resolveMediaThumbnail.ts's own tempPath.
  const tempPath = join(cacheDir, `${keyToSafeDirName(filePath)}-${randomUUID()}.mp4`)
  const remuxed = await deps.remuxMpegTsToMp4(filePath, tempPath)
  if (!remuxed) {
    await rm(tempPath, { force: true })
    return filePath
  }

  try {
    await rename(tempPath, cachePath)
    return cachePath
  } catch {
    await rm(tempPath, { force: true })
    return filePath
  }
}
