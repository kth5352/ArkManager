import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { keyToSafeDirName } from '../save/keyToSafeDirName'

// Mirrors cacheCoverImage.ts's shape (convert to webp, write under a
// cache-only directory keyed by a filesystem-safe form of the game's own
// resolveGameEntryKey key) but takes raw image bytes already in hand -
// there's no network fetch here, since the source is either a locally
// picked file or the OS clipboard, both already read into a buffer by the
// caller.
export async function saveCustomCoverImage(
  cacheDir: string,
  key: string,
  imageBuffer: Buffer
): Promise<string> {
  const outputPath = join(cacheDir, `${keyToSafeDirName(key)}.webp`)
  await mkdir(cacheDir, { recursive: true })
  await sharp(imageBuffer).webp().toFile(outputPath)
  return outputPath
}
