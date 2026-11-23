import { rm } from 'node:fs/promises'
import { openRasterImage } from '../net/rasterImage'
import { largeOverridePath } from '../mediaThumbnailProtocol'

const LARGE_PX = 2048

// Best-effort 2048px sibling (<key>.large.webp) of a saved 512px override, for
// the fullscreen cover view. A stale sibling from an earlier override is
// removed first so a failure here can never serve the previous image.
export async function saveLargeOverrideCopy(
  overridePath: string,
  imageBuffer: Buffer
): Promise<void> {
  const target = largeOverridePath(overridePath)
  await rm(target, { force: true })
  try {
    await (
      await openRasterImage(imageBuffer)
    )
      .resize(LARGE_PX, LARGE_PX, { fit: 'inside', withoutEnlargement: true })
      .webp()
      .toFile(target)
  } catch {
    // cover host falls back to the 512px override
  }
}
