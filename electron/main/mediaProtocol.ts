import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { listLibraries } from './database/librariesRepository'
import { getSetting } from './database/settingsRepository'
import { isPathWithinAnyLibrary } from './thumbnailProtocol'
import type { AppDatabase } from './database/client'

// Video/audio playback (see src/stores/mediaPlayerStore.ts) needs actual
// byte-range streaming - <video>/<audio> issue Range requests to seek, and
// a whole-file-in-memory response (like thumbnailProtocol's readFile) can't
// answer those. net.fetch on a file: URL handles Range headers natively, as
// long as the original request's headers are forwarded to it.
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
    if (!isPathWithinAnyLibrary(filePath, allowedRoots)) {
      return new Response(null, { status: 404 })
    }

    return net.fetch(pathToFileURL(filePath).toString(), { headers: request.headers })
  })
}
