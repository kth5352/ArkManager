import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { listLibraries } from './database/librariesRepository'
import { isPathWithinAnyLibrary } from './thumbnailProtocol'
import type { AppDatabase } from './database/client'

// Video/audio playback (see src/stores/mediaPlayerStore.ts) needs actual
// byte-range streaming - <video>/<audio> issue Range requests to seek, and
// a whole-file-in-memory response (like thumbnailProtocol's readFile) can't
// answer those. net.fetch on a file: URL handles Range headers natively, as
// long as the original request's headers are forwarded to it.
const MEDIA_SCHEME = 'media'

export function buildMediaUrl(filePath: string): string {
  return `${MEDIA_SCHEME}://file/${encodeURIComponent(filePath)}`
}

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

// Must run after app.whenReady(). Same trust boundary as thumbnailProtocol -
// only a path under a currently registered library is servable, so a
// compromised/buggy renderer can't use media:// to read arbitrary files
// from disk.
export function registerMediaProtocolHandler(db: AppDatabase): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const filePath = decodeFilePath(request.url)
    const libraryPaths = listLibraries(db).map((library) => library.path)
    if (!isPathWithinAnyLibrary(filePath, libraryPaths)) {
      return new Response(null, { status: 404 })
    }

    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
  })
}
