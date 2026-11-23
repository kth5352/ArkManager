import { access, readFile } from 'node:fs/promises'
import { openRasterImage } from '../net/rasterImage'
import { adjustAccent } from './accentColor'
import { largeOverridePath } from '../mediaThumbnailProtocol'

export interface OverrideCoverInfo {
  accent: string
  aspectRatio: number
}

// Accent/aspect for a user-set override thumbnail, from its 2048px sibling when
// present (else the 512px file). One small webp decode per call; null when the
// file cannot be read/decoded.
export async function readOverrideCoverInfo(
  overridePath: string
): Promise<OverrideCoverInfo | null> {
  const large = largeOverridePath(overridePath)
  const source = await access(large).then(
    () => large,
    () => overridePath
  )
  try {
    const image = await openRasterImage(await readFile(source))
    const [meta, stats] = await Promise.all([image.clone().metadata(), image.clone().stats()])
    if (!meta.width || !meta.height) return null
    const { r, g, b } = stats.dominant
    const hex = (v: number): string => v.toString(16).padStart(2, '0')
    return {
      accent: adjustAccent(`#${hex(r)}${hex(g)}${hex(b)}`),
      aspectRatio: meta.width / meta.height,
    }
  } catch {
    return null
  }
}
