import { readFile, realpath, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { isPathWithinAnyLibrary } from '../thumbnailProtocol'

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
  fileSystem: LyricsFileSystem = { realpath, readFile, readdir }
): Promise<AdjacentLyrics | null> {
  if (!isPathWithinAnyLibrary(filePath, allowedRoots)) return null

  const dirPath = dirname(filePath)
  const mediaBaseName = basename(filePath, extname(filePath))

  for (const ext of LYRICS_EXTENSIONS) {
    const exactMatch = await readLyricsFile(
      join(dirPath, `${mediaBaseName}${ext}`),
      allowedRoots,
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
      return readLyricsFile(join(dirPath, caseInsensitiveExact), allowedRoots, fileSystem)
    }
    if (subtitleFiles.length === 1) {
      return readLyricsFile(join(dirPath, subtitleFiles[0]), allowedRoots, fileSystem)
    }
    return null
  } catch {
    return null
  }
}
