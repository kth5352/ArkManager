import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { keyToSafeDirName } from '../save/keyToSafeDirName'

// Callers render this at small thumbnail sizes (the largest is
// PlaylistThumbnail's 200px "lg" tile) - 512px on the long edge covers that
// with headroom for high-DPI displays without keeping the source image's own
// (unbounded) dimensions. fit: 'inside' + withoutEnlargement means a
// genuinely small source is never upscaled or distorted, only ever shrunk.
const MAX_DIMENSION_PX = 512

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
  await sharp(imageBuffer)
    .resize(MAX_DIMENSION_PX, MAX_DIMENSION_PX, { fit: 'inside', withoutEnlargement: true })
    .webp()
    .toFile(outputPath)
  return outputPath
}
