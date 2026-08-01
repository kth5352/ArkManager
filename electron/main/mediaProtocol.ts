import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { listLibraries } from './database/librariesRepository'
import { getSetting } from './database/settingsRepository'
import { isPathWithinAnyLibrary } from './thumbnailProtocol'
import { parseRangeHeader } from './media/parseRangeHeader'
import { resolveMediaMimeType } from './media/resolveMediaMimeType'
import type { AppDatabase } from './database/client'

// Video/audio playback (see src/stores/mediaPlayerStore.ts) needs actual
// byte-range streaming - <video>/<audio> issue Range requests to seek, and a
// whole-file-in-memory response (like thumbnailProtocol's readFile) can't
// answer those, nor even reliably signal the file is seekable at all.
// net.fetch(pathToFileURL(...)) was tried first (forwarding the incoming
// request's own headers straight through) on the assumption Chromium's own
// net stack would honor Range against a file: URL the same way it does over
// HTTP - in practice this left seeking non-functional, so this instead reads
// the exact requested byte range itself via fs.createReadStream and returns
// a proper 206/Content-Range response, the same way a real HTTP media server
// would.
const MEDIA_SCHEME = 'media'

function decodeFilePath(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1))
}

// Must run before app.whenReady() - Electron requires privileged schemes to
// be registered at module load time, before the app is ready.
export function registerMediaProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ])
}

// Exported for tests - the actual response-building logic, decoupled from
// Electron's `protocol`/`Request` machinery so it can be exercised directly
// against real temp files without registering a live protocol handler.
export async function buildMediaResponse(
  filePath: string,
  allowedRoots: string[],
  rangeHeader: string | null
): Promise<Response> {
  if (!isPathWithinAnyLibrary(filePath, allowedRoots)) {
    return new Response(null, { status: 404 })
  }

  let stats: Awaited<ReturnType<typeof stat>>
  try {
    stats = await stat(filePath)
  } catch {
    return new Response(null, { status: 404 })
  }
  // media:// only ever serves a single file - createReadStream() on a
  // directory doesn't throw synchronously here, it emits an async EISDIR
  // error once the stream actually starts, which Readable.toWeb propagates
  // as an opaque stream error rather than a clean, expected 404.
  if (!stats.isFile()) {
    return new Response(null, { status: 404 })
  }
  const fileSize = stats.size

  const mimeType = resolveMediaMimeType(filePath)

  if (!rangeHeader) {
    const body = Readable.toWeb(createReadStream(filePath)) as ReadableStream
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
      },
    })
  }

  const range = parseRangeHeader(rangeHeader, fileSize)
  if (!range) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    })
  }

  const body = Readable.toWeb(
    createReadStream(filePath, { start: range.start, end: range.end })
  ) as ReadableStream
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
    },
  })
}

// Must run after app.whenReady(). Same trust boundary as thumbnailProtocol -
// only a path under a currently registered library, or the one folder the
// user explicitly picked via the Media page's native folder dialog (see
// MediaPage.tsx / the 'media-folder' setting), is servable - a
// compromised/buggy renderer can't use media:// to read arbitrary files
// from disk that the user never actually chose. The Media page deliberately
// lets a user browse any folder, not just registered libraries (see its own
// comment), so it needs this second allowed root or every file inside a
// non-library folder 404s and the player reports every track as
// unplayable.
export function registerMediaProtocolHandler(db: AppDatabase): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const filePath = decodeFilePath(request.url)
    const libraryPaths = listLibraries(db).map((library) => library.path)
    const mediaFolder = getSetting(db, 'media-folder')
    const allowedRoots = mediaFolder ? [...libraryPaths, mediaFolder] : libraryPaths
    return buildMediaResponse(filePath, allowedRoots, request.headers.get('range'))
  })
}
