import { access, readFile } from 'node:fs/promises'
import { app, protocol } from 'electron'
import { extname, join } from 'node:path'
import { isPathExactlyTrusted, isPathWithinAnyLibrary } from './thumbnailProtocol'
import { computeMediaAllowedRoots, computeMediaTrustedPaths } from './media/mediaTrustBoundary'
import { getMediaThumbnailOverride } from './database/mediaThumbnailOverridesRepository'
import { getPlaylistCoverPath } from './database/mediaPlaylistsRepository'
import type { MediaArtworkServices } from './media/mediaArtworkServices'
import type { AppDatabase } from './database/client'

const MEDIA_THUMBNAIL_SCHEME = 'mediathumb'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

// pathname only: a "?v=<version>" cache-buster (and any "#"/"?" inside the
// path, which the renderer percent-encodes) must never leak into the path.
export function decodeMediaThumbnailPath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

export function mediaThumbnailCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'media-thumbnails')
}

export function mediaCoverCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'media-covers')
}

// The user-override 512px file is <key>.webp; its 2048px sibling is
// <key>.large.webp in the same directory (see mediaThumbnailHandlers).
export function largeOverridePath(overridePath: string): string {
  return overridePath.replace(/\.webp$/i, '.large.webp')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// Decoupled from Electron's protocol/Request machinery so a test can
// exercise the priority order (override wins, then auto-extraction, then
// 404) without a real database or a real ffmpeg call. `resolve` returns the
// path for the requested kind (thumbnail 512px / cover 2048px).
export async function buildMediaThumbnailResponse(
  filePath: string,
  allowedRoots: string[],
  trustedPaths: string[],
  getOverride: (filePath: string) => string | null,
  resolve: (filePath: string) => Promise<string | null>,
  kind: 'thumbnail' | 'cover' = 'thumbnail'
): Promise<Response> {
  if (
    !isPathWithinAnyLibrary(filePath, allowedRoots) &&
    !isPathExactlyTrusted(filePath, trustedPaths)
  ) {
    return new Response(null, { status: 404 })
  }

  let overridePath = getOverride(filePath)
  if (overridePath && kind === 'cover') {
    const large = largeOverridePath(overridePath)
    if (await pathExists(large)) overridePath = large
  }
  let resolvedPath = overridePath
  if (!resolvedPath) {
    // Resolution can reject (an encode I/O error, or the cache directory
    // removed by clear-cache mid-flight) - that is a missing image, not a
    // protocol failure.
    try {
      resolvedPath = await resolve(filePath)
    } catch {
      resolvedPath = null
    }
  }
  if (!resolvedPath) return new Response(null, { status: 404 })

  try {
    const buffer = await readFile(resolvedPath)
    const mimeType = MIME_TYPES[extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream'
    return new Response(buffer, { headers: { 'Content-Type': mimeType } })
  } catch {
    return new Response(null, { status: 404 })
  }
}

// Decoupled the same way buildMediaThumbnailResponse is - getCoverPath is
// injected so a test can exercise the 200/404 cases without a real database.
export async function buildPlaylistCoverResponse(
  playlistId: string,
  getCoverPath: (playlistId: string) => string | null
): Promise<Response> {
  const coverPath = getCoverPath(playlistId)
  if (!coverPath) return new Response(null, { status: 404 })
  try {
    const buffer = await readFile(coverPath)
    const mimeType = MIME_TYPES[extname(coverPath).toLowerCase()] ?? 'application/octet-stream'
    return new Response(buffer, { headers: { 'Content-Type': mimeType } })
  } catch {
    return new Response(null, { status: 404 })
  }
}

// Must run before app.whenReady() - Electron requires privileged schemes to
// be registered at module load time.
export function registerMediaThumbnailProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_THUMBNAIL_SCHEME,
      privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
    },
  ])
}

// Must run after app.whenReady(). Same trust boundary as media:// itself
// (mediaProtocol.ts) - a thumbnail is only ever generated for a file
// media:// would also be willing to serve in the first place (a registered
// library, the one folder picked via the Media page, or an exact path
// already saved into a playlist/liked track).
export function registerMediaThumbnailProtocolHandler(
  db: AppDatabase,
  artwork: MediaArtworkServices
): void {
  protocol.handle(MEDIA_THUMBNAIL_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.hostname === 'playlist-cover') {
      const playlistId = decodeURIComponent(url.pathname.slice(1))
      return buildPlaylistCoverResponse(playlistId, (id) => getPlaylistCoverPath(db, id))
    }
    if (url.hostname !== 'thumbnail' && url.hostname !== 'cover') {
      return new Response(null, { status: 404 })
    }
    const kind = url.hostname
    const filePath = decodeMediaThumbnailPath(request.url)
    const allowedRoots = computeMediaAllowedRoots(db)
    const trustedPaths = computeMediaTrustedPaths(db)
    return buildMediaThumbnailResponse(
      filePath,
      allowedRoots,
      trustedPaths,
      (path) => getMediaThumbnailOverride(db, path),
      async (path) => {
        const art = await artwork.resolve(path)
        return art ? (kind === 'cover' ? art.cover : art.thumb) : null
      },
      kind
    )
  })
}
