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
