import { access, mkdir, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { normalizeForComparison } from '../thumbnailProtocol'
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

// Same normalization the trust check (isPathWithinAnyLibrary/
// isPathExactlyTrusted in thumbnailProtocol.ts) already applies before this
// point - without it, two different-casing or different-separator
// spellings of the literal same file (which the trust check already treats
// as equivalent) would produce two different cache entries here, doubling
// the disk/CPU cost for what should be one cached remux.
function cacheKeyFor(filePath: string): string {
  return keyToSafeDirName(normalizeForComparison(resolve(filePath)))
}

function cachePathFor(cacheDir: string, filePath: string): string {
  return join(cacheDir, `${cacheKeyFor(filePath)}.mp4`)
}

// Thin wrapper around the same cache-path-exists check resolvePlayableMediaPath
// performs internally - exported so callers that only need to know "would
// this file need a remux right now" (e.g. mediaRemuxHandlers.ts's cheap UI
// pre-check) can answer that without duplicating the cache-path
// construction logic.
export async function isAlreadyRemuxed(cacheDir: string, filePath: string): Promise<boolean> {
  return pathExists(cachePathFor(cacheDir, filePath))
}

// Concurrent requests for the same not-yet-cached file (e.g. an initial
// Range request and a seek arriving moments later) share one in-flight
// remux instead of each independently spawning a full ffmpeg pass over a
// potentially multi-GB source. Keyed by the raw filePath (not the cache
// path) so lookups don't need to re-normalize first. Cleared once the
// promise settles (success OR failure) so a later, non-concurrent call
// still gets a fresh attempt.
const inFlightRemuxes = new Map<string, Promise<string>>()

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
  const cachePath = cachePathFor(cacheDir, filePath)
  if (await isAlreadyRemuxed(cacheDir, filePath)) return cachePath

  const existing = inFlightRemuxes.get(filePath)
  if (existing) return existing

  const attempt = (async (): Promise<string> => {
    const isMpegTs = await deps.isLikelyMpegTsStream(filePath)
    if (!isMpegTs) return filePath

    await mkdir(cacheDir, { recursive: true })
    // Unique per call so a stale temp file from a previous failed attempt
    // never collides with this one.
    const tempPath = join(cacheDir, `${cacheKeyFor(filePath)}-${randomUUID()}.mp4`)
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
  })()

  inFlightRemuxes.set(filePath, attempt)
  try {
    return await attempt
  } finally {
    inFlightRemuxes.delete(filePath)
  }
}
