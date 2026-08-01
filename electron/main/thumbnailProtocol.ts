import { readFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { protocol } from 'electron'
import { findThumbnailPath } from './scanner/thumbnail'
import { listLibraries, normalizeLibraryPath } from './database/librariesRepository'
import type { AppDatabase } from './database/client'

// Folder-scan thumbnails (Gallery/List/DetailList/Explorer cards - one per
// visible row, mounted/unmounted constantly by react-window during scroll)
// used to go through IPC + a synchronous base64 encode of the whole image
// buffer (see scannerHandlers.ts's old SCANNER_GET_THUMBNAIL handler,
// electron/main/ipc/metadataHandlers.ts's METADATA_GET_COVER_IMAGE still
// does this for the much lower-traffic DLsite search results page). Electron
// runs on a single main-process thread shared with every other IPC handler
// and window operation, so a scroll-driven burst of these could stall
// popups, tab switches, and scans that happen to fire in the same moment.
// A registered protocol lets <img src="thumb://..."> load bytes directly
// through Chromium's own network stack instead, with no IPC round trip and
// no encoding step in this process at all.
const THUMBNAIL_SCHEME = 'thumb'

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

// entryPath is the SCANNED ENTRY's own folder path, never a direct file
// path - the handler always re-derives which specific image to serve via
// findThumbnailPath's own directory listing, the same trust boundary the
// old IPC handler used, rather than trusting a file path taken directly
// from the request URL.
export function buildThumbnailUrl(entryPath: string): string {
  return `${THUMBNAIL_SCHEME}://thumbnail/${encodeURIComponent(entryPath)}`
}

function decodeEntryPath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

// normalizeLibraryPath only lowercases and strips a trailing slash - it
// doesn't unify backslash vs. forward slash, which Windows paths mix freely
// (a registered library path always uses the OS-native separator, but a
// requested entryPath could in principle use either). Converting both sides
// to forward slashes here makes the prefix check separator-agnostic.
function normalizeForComparison(path: string): string {
  return normalizeLibraryPath(path).replace(/\\/g, '/')
}

// The handler's own comment used to claim entryPath was trustworthy because
// findThumbnailPath re-derives the actual file via a directory listing
// rather than trusting a file path from the URL - but findThumbnailPath will
// happily readdir *any* folder on disk, so that alone doesn't stop a
// compromised or buggy renderer from requesting thumb://.../C:/Users/x/Documents
// and reading back whatever image happens to live there. Requiring entryPath
// to fall under a currently registered library closes that gap.
//
// entryPath must be resolved (via node:path's resolve, which collapses `.`/
// `..` segments) before the prefix comparison - otherwise a path like
// "C:/Games/LibraryA/../../Windows/system.ini" still starts with the
// library's own prefix as a raw string, even though it actually points
// outside it once the OS resolves the `..` segments during the real file
// access that follows this check.
export function isPathWithinAnyLibrary(entryPath: string, libraryPaths: string[]): boolean {
  const normalizedEntry = normalizeForComparison(resolve(entryPath))
  return libraryPaths.some((libraryPath) => {
    const normalizedLibrary = normalizeForComparison(resolve(libraryPath))
    return (
      normalizedEntry === normalizedLibrary || normalizedEntry.startsWith(`${normalizedLibrary}/`)
    )
  })
}

// Must run before app.whenReady() - Electron requires privileged schemes to
// be registered at module load time, before the app is ready.
export function registerThumbnailProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: THUMBNAIL_SCHEME,
      privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
    },
  ])
}

// Must run after app.whenReady().
export function registerThumbnailProtocolHandler(db: AppDatabase): void {
  protocol.handle(THUMBNAIL_SCHEME, async (request) => {
    const entryPath = decodeEntryPath(request.url)
    const libraryPaths = listLibraries(db).map((library) => library.path)
    if (!isPathWithinAnyLibrary(entryPath, libraryPaths)) {
      return new Response(null, { status: 404 })
    }

    const thumbnailPath = await findThumbnailPath(entryPath)
    if (!thumbnailPath) return new Response(null, { status: 404 })

    try {
      const buffer = await readFile(thumbnailPath)
      const mimeType =
        MIME_TYPES[extname(thumbnailPath).toLowerCase()] ?? 'application/octet-stream'
      return new Response(buffer, { headers: { 'Content-Type': mimeType } })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
