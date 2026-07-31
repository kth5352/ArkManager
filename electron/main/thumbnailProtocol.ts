import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { protocol } from 'electron'
import { findThumbnailPath } from './scanner/thumbnail'

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
export function registerThumbnailProtocolHandler(): void {
  protocol.handle(THUMBNAIL_SCHEME, async (request) => {
    const entryPath = decodeEntryPath(request.url)
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
