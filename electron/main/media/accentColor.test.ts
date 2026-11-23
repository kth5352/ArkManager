import { describe, it, expect } from 'vitest'
import { adjustAccent } from './accentColor'

function hsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return { h: 0, s, l }
}

describe('adjustAccent', () => {
  it('clamps white and black into readable range', () => {
    for (const input of ['#ffffff', '#000000', '#808080']) {
      const out = adjustAccent(input)
      expect(out).toMatch(/^#[0-9a-f]{6}$/)
      const { s, l } = hsl(out)
      expect(l).toBeGreaterThanOrEqual(0.45 - 0.01)
      expect(l).toBeLessThanOrEqual(0.7 + 0.01)
      expect(s).toBeGreaterThanOrEqual(0.35 - 0.01)
    }
  })

  it('keeps an already readable color close to itself', () => {
    expect(adjustAccent('#3b82f6')).toBe('#3b82f6')
  })
})
