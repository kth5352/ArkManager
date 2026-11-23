const MIN_LIGHTNESS = 0.45
const MAX_LIGHTNESS = 0.7
const MIN_SATURATION = 0.35

function hueToChannel(p: number, q: number, t: number): number {
  let x = t
  if (x < 0) x += 1
  if (x > 1) x -= 1
  if (x < 1 / 6) return p + (q - p) * 6 * x
  if (x < 1 / 2) return q
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
  return p
}

/** Pulls a dominant color into a range that stays readable as an accent on dark and light UI. */
export function adjustAccent(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let l = (max + min) / 2
  const d = max - min
  let s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }
  l = Math.min(MAX_LIGHTNESS, Math.max(MIN_LIGHTNESS, l))
  s = Math.max(MIN_SATURATION, s)

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const toHex = (v: number): string =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(hueToChannel(p, q, h + 1 / 3))}${toHex(hueToChannel(p, q, h))}${toHex(hueToChannel(p, q, h - 1 / 3))}`
}
