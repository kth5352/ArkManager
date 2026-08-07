import { readFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { isPathWithinAnyLibrary } from '../thumbnailProtocol'

export interface AdjacentLyrics {
  path: string
  text: string
}

export async function readAdjacentLyrics(
  filePath: string,
  allowedRoots: string[]
): Promise<AdjacentLyrics | null> {
  if (!isPathWithinAnyLibrary(filePath, allowedRoots)) return null

  const lyricsPath = join(dirname(filePath), `${basename(filePath, extname(filePath))}.lrc`)
  try {
    return { path: lyricsPath, text: await readFile(lyricsPath, 'utf8') }
  } catch {
    return null
  }
}
