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

// Shares of the layout area the cover box may take (height, width).
export interface CoverCaps {
  height: number
  width: number
}
export const SIDE_BY_SIDE_CAPS: CoverCaps = {
  height: COVER_MAX_HEIGHT_SHARE,
  width: COVER_MAX_WIDTH_SHARE,
}
// Narrow windows (e.g. a ~400px detached player) stack the cover above the
// text: the cover may then use most of the width but only half the height,
// leaving room for the title below.
export const STACKED_CAPS: CoverCaps = { height: 0.5, width: 0.8 }
export const NARROW_LAYOUT_MAX_WIDTH_PX = 520

// An unmeasured area (0) keeps the regular side-by-side layout.
export function isNarrowCoverLayout(areaWidth: number): boolean {
  return areaWidth > 0 && areaWidth < NARROW_LAYOUT_MAX_WIDTH_PX
}

// Foreground (play icon) on a cover accent: dark on light accents, white
// otherwise. Accents from main are #rrggbb already pulled to lightness
// 0.45-0.70 (accentColor.ts), which still leaves yellows/greens too light for
// a white icon. Anything unparsable gets white, like the default primary.
export const ACCENT_FOREGROUND_DARK = '#14121a'
export const ACCENT_FOREGROUND_LIGHT = '#ffffff'
const ACCENT_LUMINANCE_THRESHOLD = 0.4

export function accentForeground(hex: string): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return ACCENT_FOREGROUND_LIGHT
  const linear = (channel: string): number => {
    const c = parseInt(channel, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * linear(match[1]) + 0.7152 * linear(match[2]) + 0.0722 * linear(match[3])
  return luminance > ACCENT_LUMINANCE_THRESHOLD ? ACCENT_FOREGROUND_DARK : ACCENT_FOREGROUND_LIGHT
}

const isPositive = (n: number): boolean => Number.isFinite(n) && n > 0

// `aspectRatio` is width ÷ height (MediaCoverInfo.aspectRatio); anything
// non-finite or ≤ 0 falls back to square. An unmeasured viewport (0×0, the
// first render before ResizeObserver reports) yields an empty box.
export function coverBoxSize(
  viewport: BoxSize,
  aspectRatio: number,
  caps: CoverCaps = SIDE_BY_SIDE_CAPS
): BoxSize {
  if (!isPositive(viewport.width) || !isPositive(viewport.height)) return { width: 0, height: 0 }
  const ratio = isPositive(aspectRatio) ? aspectRatio : 1
  const maxHeight = viewport.height * caps.height
  const maxWidth = viewport.width * caps.width
  const height = Math.min(maxHeight, maxWidth / ratio)
  return { width: height * ratio, height }
}
