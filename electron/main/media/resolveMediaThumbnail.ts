import { access, mkdir, readFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { openRasterImage } from '../net/rasterImage'
import { extractVideoFrame as defaultExtractVideoFrame } from './extractVideoFrame'
import { extractAudioArt as defaultExtractAudioArt } from './extractAudioArt'
import { findThumbnailPath as defaultFindThumbnailPath } from '../scanner/thumbnail'
import { createConcurrencyLimiter } from '../scanner/concurrencyLimiter'
import { adjustAccent } from './accentColor'
import type { ArtworkCache, GenerationSnapshot } from './mediaArtworkCache'

export interface ResolveMediaThumbnailDeps {
  extractVideoFrame: (videoPath: string, outputPath: string) => Promise<boolean>
  extractAudioArt: (audioPath: string, outputPath: string) => Promise<boolean>
  findThumbnailPath: (folderPath: string) => Promise<string | null>
  findWorkCover?: (filePath: string) => Promise<string | null>
}

export interface ArtworkInfo {
  source: 'embedded' | 'folder' | 'work-cover'
  workCoverGeneration: number
  accent: string
  aspectRatio: number
}

export interface MediaArtwork {
  thumb: string
  cover: string
  info: ArtworkInfo
}

const defaultDeps: ResolveMediaThumbnailDeps = {
  extractVideoFrame: defaultExtractVideoFrame,
  extractAudioArt: defaultExtractAudioArt,
  findThumbnailPath: defaultFindThumbnailPath,
  findWorkCover: async () => null,
}

const THUMB_PX = 512
const COVER_PX = 2048

// Module-level singleton for real production use: every uncached-file request
// in the running app funnels through this one Map, so a Media-page row and the
// fullscreen overlay resolving the same uncached track share one extraction.
// Tests pass their own Map so they never share this process-lifetime state.
const defaultInFlight = new Map<string, Promise<MediaArtwork | null>>()

// Each extractVideoFrame/extractAudioArt call spawns a real ffmpeg child
// process; in-flight merging only dedupes the SAME file, so this caps the
// number of simultaneous ffmpeg processes across different files.
const extractionLimiter = createConcurrencyLimiter(2)

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function parseInfo(raw: string): ArtworkInfo | null {
  try {
    const value = JSON.parse(raw) as Partial<ArtworkInfo>
    if (
      (value.source === 'embedded' || value.source === 'folder' || value.source === 'work-cover') &&
      typeof value.workCoverGeneration === 'number' &&
      typeof value.accent === 'string' &&
      typeof value.aspectRatio === 'number'
    ) {
      return value as ArtworkInfo
    }
  } catch {
    // fall through
  }
  return null
}

async function readCached(cache: ArtworkCache, filePath: string) {
  const paths = cache.paths(filePath)
  try {
    if ((await pathExists(paths.thumb)) && (await pathExists(paths.cover))) {
      const info = parseInfo(await readFile(paths.info, 'utf8'))
      if (
        info &&
        (info.source !== 'work-cover' || info.workCoverGeneration >= cache.workCoverGeneration())
      ) {
        return { thumb: paths.thumb, cover: paths.cover, info } satisfies MediaArtwork
      }
    }
  } catch {
    // missing/unreadable info: treat as a miss
  }
  return null
}

async function hasValidNotFound(
  cache: ArtworkCache,
  notFoundPath: string,
  isVideo: boolean
): Promise<boolean> {
  let raw: string
  try {
    raw = await readFile(notFoundPath, 'utf8')
  } catch {
    return false
  }
  // Video never uses the work-cover tier (see resolveOnce), so a work-cover
  // bump cannot change its answer: the marker stays valid until the track
  // itself is invalidated (which removes it).
  if (isVideo) return true
  let generation = 0
  try {
    const parsed = JSON.parse(raw) as { workCoverGeneration?: unknown }
    if (typeof parsed.workCoverGeneration === 'number') generation = parsed.workCoverGeneration
  } catch {
    // empty/unparseable: generation 0
  }
  return generation >= cache.workCoverGeneration()
}

interface EncodedArtwork {
  accent: string
  aspectRatio: number
}

// One decode, two outputs. Throws if the image cannot be decoded or encoded -
// the caller then falls through to the next source.
async function encodeArtwork(
  buffer: Buffer,
  thumbTemp: string,
  coverTemp: string
): Promise<EncodedArtwork> {
  const image = await openRasterImage(buffer)
  const resizeOpts = { fit: 'inside' as const, withoutEnlargement: true }
  const [, cover, stats] = await Promise.all([
    image.clone().resize(THUMB_PX, THUMB_PX, resizeOpts).webp().toFile(thumbTemp),
    image.clone().resize(COVER_PX, COVER_PX, resizeOpts).webp().toFile(coverTemp),
    image.clone().stats(),
  ])
  const { r, g, b } = stats.dominant
  const hex = (v: number): string => v.toString(16).padStart(2, '0')
  return {
    accent: adjustAccent(`#${hex(r)}${hex(g)}${hex(b)}`),
    aspectRatio: cover.width / cover.height,
  }
}

type Attempt = MediaArtwork | null | 'stale'

async function resolveOnce(
  cache: ArtworkCache,
  filePath: string,
  isVideo: boolean,
  deps: ResolveMediaThumbnailDeps,
  snapshot: GenerationSnapshot
): Promise<Attempt> {
  const paths = cache.paths(filePath)
  const thumbDir = dirname(paths.thumb)
  const coverDir = dirname(paths.cover)
  await Promise.all([mkdir(thumbDir, { recursive: true }), mkdir(coverDir, { recursive: true })])
  const id = randomUUID()
  const thumbTemp = join(thumbDir, `${id}.thumb.tmp.webp`)
  const coverTemp = join(coverDir, `${id}.cover.tmp.webp`)
  const frameTemp = join(thumbDir, `${id}.jpg`)

  // Transient failures (unreadable file) must not be cached as "no artwork".
  let transientFailure = false

  const sources: Array<{
    source: ArtworkInfo['source']
    load: () => Promise<Buffer | null>
  }> = [
    {
      source: 'embedded',
      load: async () => {
        const extracted = await extractionLimiter(() =>
          isVideo
            ? deps.extractVideoFrame(filePath, frameTemp)
            : deps.extractAudioArt(filePath, frameTemp)
        )
        if (!extracted) return null
        try {
          return await readFile(frameTemp)
        } finally {
          await rm(frameTemp, { force: true })
        }
      },
    },
  ]
  // Video has no directory-image or work-cover tier: a stray folder image next
  // to a video is far less likely to be "this video's cover" than for music.
  if (!isVideo) {
    sources.push(
      {
        source: 'folder',
        load: async () => {
          const found = await deps.findThumbnailPath(dirname(filePath))
          return found ? readFile(found) : null
        },
      },
      {
        source: 'work-cover',
        load: async () => {
          const found = deps.findWorkCover ? await deps.findWorkCover(filePath) : null
          return found ? readFile(found) : null
        },
      }
    )
  }

  try {
    for (const { source, load } of sources) {
      let buffer: Buffer | null
      try {
        buffer = await load()
      } catch {
        transientFailure = true
        continue
      }
      if (!buffer) continue

      let encoded: EncodedArtwork
      try {
        encoded = await encodeArtwork(buffer, thumbTemp, coverTemp)
      } catch {
        await Promise.all([rm(thumbTemp, { force: true }), rm(coverTemp, { force: true })])
        continue
      }

      const info: ArtworkInfo = {
        source,
        workCoverGeneration: snapshot.workCover,
        accent: encoded.accent,
        aspectRatio: encoded.aspectRatio,
      }
      const outcome = await cache.commit(
        filePath,
        snapshot,
        [
          { temp: thumbTemp, final: paths.thumb },
          { temp: coverTemp, final: paths.cover },
        ],
        [{ path: paths.info, content: JSON.stringify(info) }]
      )
      if (outcome === 'stale') return 'stale'
      await rm(paths.notFound, { force: true })
      return { thumb: paths.thumb, cover: paths.cover, info }
    }
  } finally {
    await rm(frameTemp, { force: true })
  }

  if (transientFailure) return null
  const outcome = await cache.commit(
    filePath,
    snapshot,
    [],
    [
      {
        path: paths.notFound,
        content: JSON.stringify({ workCoverGeneration: snapshot.workCover }),
      },
    ]
  )
  return outcome === 'stale' ? 'stale' : null
}

async function resolveWithRetry(
  cache: ArtworkCache,
  filePath: string,
  isVideo: boolean,
  deps: ResolveMediaThumbnailDeps,
  firstSnapshot: GenerationSnapshot
): Promise<MediaArtwork | null> {
  let snapshot = firstSnapshot
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await resolveOnce(cache, filePath, isVideo, deps, snapshot)
    if (result !== 'stale') return result
    snapshot = { track: cache.trackGeneration(filePath), workCover: cache.workCoverGeneration() }
  }
  return null
}

// Resolves both artwork sizes plus accent/aspect info for a media file,
// caching them through the artwork cache (file existence is the cache).
export async function resolveMediaArtwork(
  cache: ArtworkCache,
  filePath: string,
  isVideo: boolean,
  deps: ResolveMediaThumbnailDeps = defaultDeps,
  inFlight: Map<string, Promise<MediaArtwork | null>> = defaultInFlight
): Promise<MediaArtwork | null> {
  const cached = await readCached(cache, filePath)
  if (cached) return cached
  if (await hasValidNotFound(cache, cache.paths(filePath).notFound, isVideo)) {
    return null
  }

  const snapshot: GenerationSnapshot = {
    track: cache.trackGeneration(filePath),
    workCover: cache.workCoverGeneration(),
  }
  // Pipe-joined: | can never appear in a Windows path.
  const key = [filePath, isVideo, snapshot.track, snapshot.workCover].join('|')
  const existing = inFlight.get(key)
  if (existing) return existing

  const promise = resolveWithRetry(cache, filePath, isVideo, deps, snapshot).finally(() => {
    inFlight.delete(key)
  })
  inFlight.set(key, promise)
  return promise
}

export function artworkDepsWithWorkCover(
  findWorkCover: (filePath: string) => Promise<string | null>
): ResolveMediaThumbnailDeps {
  return { ...defaultDeps, findWorkCover }
}
