import { readFile } from 'node:fs/promises'
import { app, protocol } from 'electron'
import { extname, join } from 'node:path'
import { isVideoFile } from '../../shared/isMediaFile'
import { isPathWithinAnyLibrary } from './thumbnailProtocol'
import { listLibraries } from './database/librariesRepository'
import { getSetting } from './database/settingsRepository'
import { getMediaThumbnailOverride } from './database/mediaThumbnailOverridesRepository'
import { resolveMediaThumbnail } from './media/resolveMediaThumbnail'
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

function decodeFilePath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

export function mediaThumbnailCacheDir(): string {
  return join(app.getPath('userData'), 'cache', 'media-thumbnails')
}

// Decoupled from Electron's protocol/Request machinery (same reasoning as
// mediaProtocol.ts's buildMediaResponse) - getOverride/resolve are injected
// so a test can exercise the priority order (override wins, then
// auto-extraction, then 404) without a real database or a real ffmpeg call.
export async function buildMediaThumbnailResponse(
  filePath: string,
  allowedRoots: string[],
  cacheDir: string,
  getOverride: (filePath: string) => string | null,
  resolve: (
    cacheDir: string,
    filePath: string,
    isVideo: boolean
  ) => Promise<string | null> = resolveMediaThumbnail
): Promise<Response> {
  if (!isPathWithinAnyLibrary(filePath, allowedRoots)) {
    return new Response(null, { status: 404 })
  }

  const overridePath = getOverride(filePath)
  const resolvedPath = overridePath ?? (await resolve(cacheDir, filePath, isVideoFile(filePath)))
  if (!resolvedPath) return new Response(null, { status: 404 })

  try {
    const buffer = await readFile(resolvedPath)
    const mimeType = MIME_TYPES[extname(resolvedPath).toLowerCase()] ?? 'application/octet-stream'
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
// library, or the one folder picked via the Media page).
export function registerMediaThumbnailProtocolHandler(db: AppDatabase): void {
  const cacheDir = mediaThumbnailCacheDir()
  protocol.handle(MEDIA_THUMBNAIL_SCHEME, async (request) => {
    const filePath = decodeFilePath(request.url)
    const libraryPaths = listLibraries(db).map((library) => library.path)
    const mediaFolder = getSetting(db, 'media-folder')
    const allowedRoots = mediaFolder ? [...libraryPaths, mediaFolder] : libraryPaths
    return buildMediaThumbnailResponse(filePath, allowedRoots, cacheDir, (path) =>
      getMediaThumbnailOverride(db, path)
    )
  })
}
