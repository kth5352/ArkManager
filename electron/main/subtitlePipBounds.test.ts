import { describe, it, expect } from 'vitest'
import { clampSubtitlePipBounds, type WindowBounds } from './subtitlePipBounds'

const DEFAULT_BOUNDS: WindowBounds = { x: 800, y: 600, width: 320, height: 80 }

describe('clampSubtitlePipBounds', () => {
  it('returns the default when there is no saved position (first run)', () => {
    const displays: WindowBounds[] = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    expect(clampSubtitlePipBounds(null, displays, DEFAULT_BOUNDS)).toEqual(DEFAULT_BOUNDS)
  })

  it('returns the saved position when it fully overlaps a display', () => {
    const saved: WindowBounds = { x: 100, y: 100, width: 320, height: 80 }
    const displays: WindowBounds[] = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    expect(clampSubtitlePipBounds(saved, displays, DEFAULT_BOUNDS)).toEqual(saved)
  })

  it('returns the default when the saved position is fully outside every display (monitor disconnected)', () => {
    const saved: WindowBounds = { x: 3000, y: 3000, width: 320, height: 80 }
    const displays: WindowBounds[] = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    expect(clampSubtitlePipBounds(saved, displays, DEFAULT_BOUNDS)).toEqual(DEFAULT_BOUNDS)
  })

  it('returns the saved position when it partially overlaps a display', () => {
    const saved: WindowBounds = { x: 1900, y: 1060, width: 320, height: 80 }
    const displays: WindowBounds[] = [{ x: 0, y: 0, width: 1920, height: 1080 }]
    expect(clampSubtitlePipBounds(saved, displays, DEFAULT_BOUNDS)).toEqual(saved)
  })

  it('checks every display, not just the first one', () => {
    const saved: WindowBounds = { x: 2000, y: 100, width: 320, height: 80 }
    const displays: WindowBounds[] = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ]
    expect(clampSubtitlePipBounds(saved, displays, DEFAULT_BOUNDS)).toEqual(saved)
  })

  it('returns the default when there are no displays at all', () => {
    const saved: WindowBounds = { x: 100, y: 100, width: 320, height: 80 }
    expect(clampSubtitlePipBounds(saved, [], DEFAULT_BOUNDS)).toEqual(DEFAULT_BOUNDS)
  })
})
