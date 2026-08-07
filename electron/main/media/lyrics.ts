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

export async function readAdjacentLyrics(
  filePath: string,
  allowedRoots: string[],
  fileSystem: LyricsFileSystem = { realpath, readFile, readdir }
): Promise<AdjacentLyrics | null> {
  if (!isPathWithinAnyLibrary(filePath, allowedRoots)) return null

  const dirPath = dirname(filePath)
  const mediaBaseName = basename(filePath, extname(filePath))
  const lyricsPath = join(dirPath, `${mediaBaseName}.lrc`)
  const exactMatch = await readLyricsFile(lyricsPath, allowedRoots, fileSystem)
  if (exactMatch) return exactMatch

  try {
    const lrcFiles = (await fileSystem.readdir(dirPath)).filter((name) =>
      name.toLowerCase().endsWith('.lrc')
    )
    const caseInsensitiveExact = lrcFiles.find(
      (name) => name.slice(0, -4).toLowerCase() === mediaBaseName.toLowerCase()
    )
    if (caseInsensitiveExact) {
      return readLyricsFile(join(dirPath, caseInsensitiveExact), allowedRoots, fileSystem)
    }
    if (lrcFiles.length === 1) {
      return readLyricsFile(join(dirPath, lrcFiles[0]), allowedRoots, fileSystem)
    }
    return null
  } catch {
    return null
  }
}
