import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { keyToSafeDirName } from '../save/keyToSafeDirName'
import { saveCustomCoverImage } from '../customCover/saveCustomCoverImage'
import { extractVideoFrame as defaultExtractVideoFrame } from './extractVideoFrame'
import { extractAudioArt as defaultExtractAudioArt } from './extractAudioArt'
import { findThumbnailPath as defaultFindThumbnailPath } from '../scanner/thumbnail'
import { createConcurrencyLimiter } from '../scanner/concurrencyLimiter'

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

// Module-level singleton for real production use (mediaThumbnailProtocol.ts
// never passes its own) - every uncached-file request in the running app
// funnels through this one Map, so a Media-page row and the fullscreen
// overlay resolving the same uncached track around the same time genuinely
// share one extraction+save instead of racing. Tests that need to control
// in-flight state independently pass their own Map (see
// resolveMediaThumbnail.test.ts) so they never share this process-lifetime
// singleton with each other or with production code.
const defaultInFlight = new Map<string, Promise<string | null>>()

// Each extractVideoFrame/extractAudioArt call spawns a real ffmpeg child
// process (execFile, up to a 15s timeout) - in-flight merging above only
// dedupes repeat requests for the SAME file; scrolling a Media page with
// many DIFFERENT uncached tracks visible at once could still spawn one
// ffmpeg process per track simultaneously with no cap at all. 2 is the
// plan's own starting point for this limiter; module-level so the cap
// holds across concurrent resolveMediaThumbnail calls for different files,
// not just within one.
const extractionLimiter = createConcurrencyLimiter(2)

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// The actual resolution work, run at most once per in-flight key at a time
// (see the wrapper below) - a synthetic benchmark measured that WITHOUT
// merging, two concurrent requests for the same uncached file didn't just
// waste a duplicate ffmpeg extraction: both also called saveCustomCoverImage
// (sharp().toFile()) against the SAME destination path concurrently, and one
// of the two calls failed outright (returning null - a thumbnail that should
// have resolved successfully silently didn't). Merging closes both the
// wasted-work and the correctness problem at once, since only one
// saveCustomCoverImage call for a given file ever runs at a time now.
async function resolveMediaThumbnailUncached(
  cacheDir: string,
  filePath: string,
  isVideo: boolean,
  deps: ResolveMediaThumbnailDeps,
  notFoundMarkerPath: string
): Promise<string | null> {
  await mkdir(cacheDir, { recursive: true })
  // Unique per call (not just per filePath) so two concurrent requests for
  // DIFFERENT files never share one temp filename. (Two concurrent requests
  // for the SAME file no longer reach here independently at all - see the
  // in-flight merge below - but this still matters across different files
  // resolving at the same time.)
  const tempPath = join(cacheDir, `${keyToSafeDirName(filePath)}-${randomUUID()}.jpg`)

  const extracted = await extractionLimiter(() =>
    isVideo ? deps.extractVideoFrame(filePath, tempPath) : deps.extractAudioArt(filePath, tempPath)
  )

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
  //
  // The found image is read and re-saved through saveCustomCoverImage (same
  // as the extraction tier above) rather than returned as-is - it's an
  // arbitrary file the user dropped in their media folder, not something
  // this app generated, so nothing bounds its size. A real folder in this
  // app's own test data turned out to have a 7.5MB PNG next to it, served
  // uncached and unresized to every track in that folder on every single
  // visit (readFile + IPC transfer + Chromium decode, repeated per track,
  // forever - live-reported as "the whole Media tab feels heavy"). Caching
  // it under the requesting track's own key means only the FIRST request
  // per track pays this cost - resolveMediaThumbnail's own top-of-function
  // pathExists(cachePath) check short-circuits every later request for the
  // same track, same as the extraction tier.
  if (!isVideo) {
    const directoryImage = await deps.findThumbnailPath(dirname(filePath))
    if (directoryImage) {
      try {
        const buffer = await readFile(directoryImage)
        return await saveCustomCoverImage(cacheDir, filePath, buffer)
      } catch {
        return null
      }
    }
  }

  // Every tier was tried and genuinely found nothing (as opposed to the
  // catch blocks above, which are transient read/save failures - those must
  // NOT be cached negatively, since retrying could succeed once whatever
  // went wrong clears up).
  await writeFile(notFoundMarkerPath, '')
  return null
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
  deps: ResolveMediaThumbnailDeps = defaultDeps,
  inFlight: Map<string, Promise<string | null>> = defaultInFlight
): Promise<string | null> {
  const cachePath = join(cacheDir, `${keyToSafeDirName(filePath)}.webp`)
  if (await pathExists(cachePath)) return cachePath
  // A prior call already tried every tier below (ffmpeg extraction, then the
  // directory-image fallback for audio) and genuinely found nothing - without
  // this, a track with no embedded art and no folder image (a corrupted
  // file, an unsupported codec, or just a track that never had cover art)
  // re-pays the full extraction cost - including ffmpeg's up-to-15s timeout
  // on a file it can't read - on every single request, forever. This was a
  // real, live-reported cause of the Media tab "feeling heavy" on repeat
  // visits. Cleared the same way as the positive cache above: deleting
  // cache/media-thumbnails (see clearCache.ts) removes this marker too, so a
  // user can force a re-attempt if the underlying file ever changes.
  const notFoundMarkerPath = `${cachePath}.notfound`
  if (await pathExists(notFoundMarkerPath)) return null

  // Merge concurrent requests for the exact same (cacheDir, filePath,
  // isVideo) - isVideo is part of the key even though it's derivable from
  // filePath alone in practice, since nothing here enforces that invariant
  // and a mismatched isVideo for the same path would otherwise silently
  // share the wrong in-flight promise. Pipe-joined (not space-joined) so a
  // cacheDir/filePath boundary is never ambiguous - a space is a valid
  // Windows path character, but | is reserved and can never appear in one.
  const inFlightKey = [cacheDir, filePath, isVideo].join('|')
  const existing = inFlight.get(inFlightKey)
  if (existing) return existing

  const promise = resolveMediaThumbnailUncached(
    cacheDir,
    filePath,
    isVideo,
    deps,
    notFoundMarkerPath
  ).finally(() => {
    // Removed once settled (success OR failure) regardless - a later,
    // non-concurrent request for the same file starts its own fresh
    // pathExists(cachePath)/pathExists(notFoundMarkerPath) check rather than
    // being stuck sharing a long-finished promise.
    inFlight.delete(inFlightKey)
  })
  inFlight.set(inFlightKey, promise)
  return promise
}
