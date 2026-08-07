import { readFile, realpath } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { isPathWithinAnyLibrary } from '../thumbnailProtocol'

export interface AdjacentLyrics {
  path: string
  text: string
}

interface LyricsFileSystem {
  realpath: (path: string) => Promise<string>
  readFile: (path: string, encoding: 'utf8') => Promise<string>
}

export async function readAdjacentLyrics(
  filePath: string,
  allowedRoots: string[],
  fileSystem: LyricsFileSystem = { realpath, readFile }
): Promise<AdjacentLyrics | null> {
  if (!isPathWithinAnyLibrary(filePath, allowedRoots)) return null

  const lyricsPath = join(dirname(filePath), `${basename(filePath, extname(filePath))}.lrc`)
  try {
    const resolvedLyricsPath = await fileSystem.realpath(lyricsPath)
    if (!isPathWithinAnyLibrary(resolvedLyricsPath, allowedRoots)) return null
    return { path: lyricsPath, text: await fileSystem.readFile(resolvedLyricsPath, 'utf8') }
  } catch {
    return null
  }
}
