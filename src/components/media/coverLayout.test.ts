import { describe, expect, it } from 'vitest'
import {
  ACCENT_FOREGROUND_DARK,
  ACCENT_FOREGROUND_LIGHT,
  COVER_MAX_HEIGHT_SHARE,
  COVER_MAX_WIDTH_SHARE,
  STACKED_CAPS,
  accentForeground,
  coverBoxSize,
  coverDisplay,
  isNarrowCoverLayout,
} from './coverLayout'

describe('coverDisplay', () => {
  it('is pending until the cover info arrives', () => {
    expect(coverDisplay(undefined, false)).toBe('pending')
  })
  it('shows the cover when main has one and it has not failed to load', () => {
    expect(coverDisplay({ hasCover: true }, false)).toBe('cover')
  })
  it('falls back to the no-cover look when the image failed or there is none', () => {
    expect(coverDisplay({ hasCover: true }, true)).toBe('none')
    expect(coverDisplay({ hasCover: false }, false)).toBe('none')
  })
})

type Case = [string, { width: number; height: number }, number, { width: number; height: number }]

// Expected boxes: height ≤ 2/3·viewport.height, width ≤ 45%·viewport.width,
// whichever cap binds first, aspect ratio (width ÷ height) preserved.
const cases: Case[] = [
  // 1920×1080: height cap 720, width cap 864. 4:3 at h=720 → w=960 > 864,
  // so the width cap binds: 864 × 648.
  [
    '4:3 landscape in 1920×1080 (width-limited)',
    { width: 1920, height: 1080 },
    4 / 3,
    { width: 864, height: 648 },
  ],
  // Square: h=720 → w=720 ≤ 864, height cap binds.
  [
    'square in 1920×1080 (height-limited)',
    { width: 1920, height: 1080 },
    1,
    { width: 720, height: 720 },
  ],
  // Portrait 2:3: h=720 → w=480.
  ['2:3 portrait in 1920×1080', { width: 1920, height: 1080 }, 2 / 3, { width: 480, height: 720 }],
  // Ultrawide 3440×1440: height cap 960, width cap 1548; 4:3 → 1280 × 960.
  [
    '4:3 in an ultrawide viewport (height-limited)',
    { width: 3440, height: 1440 },
    4 / 3,
    { width: 1280, height: 960 },
  ],
  // Narrow/tall window 800×1200: height cap 800, width cap 360; square → 360.
  [
    'square in a narrow portrait window (width-limited)',
    { width: 800, height: 1200 },
    1,
    { width: 360, height: 360 },
  ],
  // Extreme panorama 5:1 in 1920×1080: width cap 864 → 864 × 172.8.
  ['5:1 panorama', { width: 1920, height: 1080 }, 5, { width: 864, height: 172.8 }],
  // Extreme tall 1:5: height cap 720 → 144 × 720.
  ['1:5 tall strip', { width: 1920, height: 1080 }, 0.2, { width: 144, height: 720 }],
  // Tiny 100×60: height cap 40, width cap 45; 4:3 at h=40 → 53.3 > 45 → 45 × 33.75.
  ['4:3 in a tiny viewport', { width: 100, height: 60 }, 4 / 3, { width: 45, height: 33.75 }],
]

describe('coverBoxSize', () => {
  it.each(cases)('%s', (_name, viewport, ratio, expected) => {
    const box = coverBoxSize(viewport, ratio)
    expect(box.width).toBeCloseTo(expected.width, 6)
    expect(box.height).toBeCloseTo(expected.height, 6)
    expect(box.height).toBeLessThanOrEqual(viewport.height * COVER_MAX_HEIGHT_SHARE + 1e-9)
    expect(box.width).toBeLessThanOrEqual(viewport.width * COVER_MAX_WIDTH_SHARE + 1e-9)
    expect(box.width / box.height).toBeCloseTo(ratio, 6)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'treats an invalid aspect ratio (%s) as square',
    (ratio) => {
      expect(coverBoxSize({ width: 1920, height: 1080 }, ratio)).toEqual({
        width: 720,
        height: 720,
      })
    }
  )

  it('returns an empty box for an unmeasured (0×0) or invalid viewport', () => {
    expect(coverBoxSize({ width: 0, height: 0 }, 1)).toEqual({ width: 0, height: 0 })
    expect(coverBoxSize({ width: Number.NaN, height: 500 }, 1)).toEqual({ width: 0, height: 0 })
    expect(coverBoxSize({ width: -10, height: 500 }, 1)).toEqual({ width: 0, height: 0 })
  })
})

describe('coverBoxSize with the stacked (narrow) caps', () => {
  it('lets the cover use 80% of the width but only half the height', () => {
    // 400×700: height cap 350, width cap 320; square → 320.
    expect(coverBoxSize({ width: 400, height: 700 }, 1, STACKED_CAPS)).toEqual({
      width: 320,
      height: 320,
    })
    // 4:3 in 400×300: height cap 150 → 200×150 (width cap 320 not reached).
    const box = coverBoxSize({ width: 400, height: 300 }, 4 / 3, STACKED_CAPS)
    expect(box.width).toBeCloseTo(200, 6)
    expect(box.height).toBeCloseTo(150, 6)
  })
})

describe('isNarrowCoverLayout', () => {
  it.each([
    [0, false],
    [400, true],
    [519, true],
    [520, false],
    [1600, false],
  ])('%s px → %s', (width, narrow) => {
    expect(isNarrowCoverLayout(width)).toBe(narrow)
  })
})

describe('accentForeground', () => {
  it.each([
    ['#f2c36b', ACCENT_FOREGROUND_DARK], // yellow
    ['#5ce65c', ACCENT_FOREGROUND_DARK], // green
    ['#f0f0f0', ACCENT_FOREGROUND_DARK], // white-ish
    ['#e6d84a', ACCENT_FOREGROUND_DARK], // lemon
    ['#3b82f6', ACCENT_FOREGROUND_LIGHT], // blue
    ['#9c4dcc', ACCENT_FOREGROUND_LIGHT], // purple
    ['#e53935', ACCENT_FOREGROUND_LIGHT], // red
    ['#2f6fb3', ACCENT_FOREGROUND_LIGHT], // dark blue
  ])('%s → %s', (accent, expected) => {
    expect(accentForeground(accent)).toBe(expected)
  })

  it('falls back to the light foreground for anything that is not #rrggbb', () => {
    expect(accentForeground('hsl(200 50% 50%)')).toBe(ACCENT_FOREGROUND_LIGHT)
    expect(accentForeground('#fff')).toBe(ACCENT_FOREGROUND_LIGHT)
  })
})
