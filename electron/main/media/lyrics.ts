import { readFile, realpath, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { isPathExactlyTrusted, isPathWithinAnyLibrary } from '../thumbnailProtocol'

export interface AdjacentLyrics {
  path: string
  text: string
}

interface LyricsFileSystem {
  realpath: (path: string) => Promise<string>
  readFile: (path: string, encoding: 'utf8') => Promise<string>
  readdir: (path: string) => Promise<string[]>
}

async function readLyricsFile(
  lyricsPath: string,
  allowedRoots: string[],
  fileSystem: LyricsFileSystem
): Promise<AdjacentLyrics | null> {
  try {
    const resolvedLyricsPath = await fileSystem.realpath(lyricsPath)
    if (!isPathWithinAnyLibrary(resolvedLyricsPath, allowedRoots)) return null
    return { path: lyricsPath, text: await fileSystem.readFile(resolvedLyricsPath, 'utf8') }
  } catch {
    return null
  }
}

// Priority order when multiple formats could all match the same media file
// (rare in practice) - .lrc first since it was this app's original, most
// common format.
const LYRICS_EXTENSIONS = ['.lrc', '.vtt', '.ass']

export async function readAdjacentLyrics(
  filePath: string,
  allowedRoots: string[],
  trustedPaths: string[] = [],
  fileSystem: LyricsFileSystem = { realpath, readFile, readdir }
): Promise<AdjacentLyrics | null> {
  const isTrusted =
    isPathWithinAnyLibrary(filePath, allowedRoots) || isPathExactlyTrusted(filePath, trustedPaths)
  if (!isTrusted) return null

  const dirPath = dirname(filePath)
  // Once filePath itself is trusted - whether via allowedRoots or an exact
  // saved playlist/liked match - its own containing folder becomes an
  // ad-hoc trusted root for sibling lyrics-file lookups too. Otherwise a
  // track trusted only by exact match (its folder isn't a registered
  // library or the current media-folder) would pass the check above but
  // then have every sibling lookup below rejected anyway. Mirrors the same
  // reasoning resolveMediaThumbnail's directory-image fallback already
  // relies on for its own thumbnail lookup - see isPathExactlyTrusted's
  // doc comment in thumbnailProtocol.ts.
  const siblingAllowedRoots = [...allowedRoots, dirPath]
  const mediaBaseName = basename(filePath, extname(filePath))

  for (const ext of LYRICS_EXTENSIONS) {
    const exactMatch = await readLyricsFile(
      join(dirPath, `${mediaBaseName}${ext}`),
      siblingAllowedRoots,
      fileSystem
    )
    if (exactMatch) return exactMatch
  }

  try {
    const subtitleFiles = (await fileSystem.readdir(dirPath)).filter((name) =>
      LYRICS_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext))
    )
    const caseInsensitiveExact = subtitleFiles.find(
      (name) => basename(name, extname(name)).toLowerCase() === mediaBaseName.toLowerCase()
    )
    if (caseInsensitiveExact) {
      return readLyricsFile(join(dirPath, caseInsensitiveExact), siblingAllowedRoots, fileSystem)
    }
    if (subtitleFiles.length === 1) {
      return readLyricsFile(join(dirPath, subtitleFiles[0]), siblingAllowedRoots, fileSystem)
    }
    return null
  } catch {
    return null
  }
}
