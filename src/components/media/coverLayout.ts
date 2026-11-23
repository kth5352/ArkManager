// Cover box of the audio fullscreen view's default layout (spec §3.1/§3.8):
// the cover keeps its original aspect ratio (DLsite work covers are usually
// a landscape 4:3) and is fitted inside about 2/3 of the view's height and at
// most 45% of its width, whichever binds first.
export const COVER_MAX_HEIGHT_SHARE = 2 / 3
export const COVER_MAX_WIDTH_SHARE = 0.45

export interface BoxSize {
  width: number
  height: number
}

// What the audio view shows in the cover slot: 'pending' while the cover
// info query hasn't answered yet (an empty slot, so neither a placeholder
// icon nor a broken image flashes), 'cover' when main reports a cover and its
// image hasn't failed to load for this track, 'none' otherwise (spec §3.3).
export type CoverDisplay = 'pending' | 'cover' | 'none'

export function coverDisplay(
  coverInfo: { hasCover: boolean } | undefined,
  imageFailed: boolean
): CoverDisplay {
  if (coverInfo === undefined) return 'pending'
  return coverInfo.hasCover && !imageFailed ? 'cover' : 'none'
}

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0

// `aspectRatio` is width ÷ height (MediaCoverInfo.aspectRatio); anything
// non-finite or ≤ 0 falls back to square. An unmeasured viewport (0×0, the
// first render before ResizeObserver reports) yields an empty box.
export function coverBoxSize(viewport: BoxSize, aspectRatio: number): BoxSize {
  if (!isPositive(viewport.width) || !isPositive(viewport.height)) return { width: 0, height: 0 }
  const ratio = isPositive(aspectRatio) ? aspectRatio : 1
  const maxHeight = viewport.height * COVER_MAX_HEIGHT_SHARE
  const maxWidth = viewport.width * COVER_MAX_WIDTH_SHARE
  const height = Math.min(maxHeight, maxWidth / ratio)
  return { width: height * ratio, height }
}
