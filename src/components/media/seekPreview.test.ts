import { describe, expect, it } from 'vitest'
import {
  bucketFor,
  clampPreviewLeft,
  createPreviewCache,
  nextPreviewGeneration,
  previewCardWidth,
  secondsAtPointer,
  shouldDisplayPreview,
} from './seekPreview'

describe('bucketFor', () => {
  it('returns null for an unknown duration or a non-finite time', () => {
    expect(bucketFor(10, 0)).toBeNull()
    expect(bucketFor(10, -5)).toBeNull()
    expect(bucketFor(10, NaN)).toBeNull()
    expect(bucketFor(10, Infinity)).toBeNull()
    expect(bucketFor(NaN, 100)).toBeNull()
    expect(bucketFor(Infinity, 100)).toBeNull()
  })

  it('uses 18s buckets for a one-hour file', () => {
    expect(bucketFor(0, 3600)).toBe(0)
    expect(bucketFor(17.9, 3600)).toBe(0)
    expect(bucketFor(18, 3600)).toBe(18)
    expect(bucketFor(1000, 3600)).toBe(990)
  })

  it('uses 1s buckets for files of 200s or less', () => {
    expect(bucketFor(42.7, 100)).toBe(42)
    expect(bucketFor(0.4, 30)).toBe(0)
  })

  it('never returns a bucket starting at or past the end', () => {
    expect(bucketFor(3599.9, 3600)).toBe(3582)
    expect(bucketFor(3600, 3600)).toBe(3582)
    expect(bucketFor(100, 100)).toBe(99)
    expect(bucketFor(5000, 100)).toBe(99)
    expect(bucketFor(0.3, 0.5)).toBe(0)
  })

  it('clamps a negative time to the first bucket', () => {
    expect(bucketFor(-3, 100)).toBe(0)
  })
})

describe('nextPreviewGeneration', () => {
  it('adopts generation only for matching loadedPath', () => {
    expect(
      nextPreviewGeneration(null, 'D:/a.mp4', { loadedPath: 'D:/a.mp4', loadGeneration: 4 })
    ).toBe(4)
    expect(
      nextPreviewGeneration(3, 'D:/a.mp4', { loadedPath: 'D:/a.mp4', loadGeneration: 4 })
    ).toBe(4)
  })

  it('keeps the current value for another path or no path', () => {
    expect(
      nextPreviewGeneration(null, 'D:/a.mp4', { loadedPath: 'D:/b.mp4', loadGeneration: 4 })
    ).toBeNull()
    expect(
      nextPreviewGeneration(2, 'D:/a.mp4', { loadedPath: 'D:/b.mp4', loadGeneration: 4 })
    ).toBe(2)
    expect(nextPreviewGeneration(2, 'D:/a.mp4', { loadedPath: null, loadGeneration: 4 })).toBe(2)
  })
})

describe('shouldDisplayPreview', () => {
  const cur = { generation: 5, hoveredBucket: 18, lastDrawnRequestId: 3 }

  it('caches and draws the hovered bucket of the current generation', () => {
    expect(shouldDisplayPreview({ generation: 5, seconds: 18, requestId: 4 }, cur)).toEqual({
      cache: true,
      draw: true,
    })
  })

  it('drops a response of an old generation entirely', () => {
    expect(shouldDisplayPreview({ generation: 4, seconds: 18, requestId: 9 }, cur)).toEqual({
      cache: false,
      draw: false,
    })
  })

  it('does nothing while the generation is null', () => {
    expect(
      shouldDisplayPreview(
        { generation: 5, seconds: 18, requestId: 9 },
        { ...cur, generation: null }
      )
    ).toEqual({ cache: false, draw: false })
  })

  it('caches but does not draw another bucket', () => {
    expect(shouldDisplayPreview({ generation: 5, seconds: 36, requestId: 9 }, cur)).toEqual({
      cache: true,
      draw: false,
    })
  })

  it('caches but does not draw when the pointer left the bar', () => {
    expect(
      shouldDisplayPreview(
        { generation: 5, seconds: 18, requestId: 9 },
        { ...cur, hoveredBucket: null }
      )
    ).toEqual({ cache: true, draw: false })
  })

  it('does not draw an older request over a newer one already drawn', () => {
    expect(shouldDisplayPreview({ generation: 5, seconds: 18, requestId: 2 }, cur)).toEqual({
      cache: true,
      draw: false,
    })
    expect(shouldDisplayPreview({ generation: 5, seconds: 18, requestId: 3 }, cur)).toEqual({
      cache: true,
      draw: false,
    })
  })
})

describe('createPreviewCache', () => {
  it('evicts the least recently used entry beyond the limit', () => {
    const cache = createPreviewCache<string>(2)
    cache.set(1, 'a')
    cache.set(2, 'b')
    cache.set(3, 'c')
    expect(cache.has(1)).toBe(false)
    expect(cache.get(2)).toBe('b')
    expect(cache.get(3)).toBe('c')
    expect(cache.size).toBe(2)
  })

  it('get refreshes recency', () => {
    const cache = createPreviewCache<string>(2)
    cache.set(1, 'a')
    cache.set(2, 'b')
    expect(cache.get(1)).toBe('a')
    cache.set(3, 'c')
    expect(cache.has(1)).toBe(true)
    expect(cache.has(2)).toBe(false)
  })

  it('re-setting a key refreshes it, and clear empties the cache', () => {
    const cache = createPreviewCache<string>(2)
    cache.set(1, 'a')
    cache.set(2, 'b')
    cache.set(1, 'a2')
    cache.set(3, 'c')
    expect(cache.get(1)).toBe('a2')
    expect(cache.has(2)).toBe(false)
    cache.clear()
    expect(cache.size).toBe(0)
    expect(cache.get(1)).toBeUndefined()
  })

  it('defaults to 300 entries', () => {
    const cache = createPreviewCache<number>()
    for (let i = 0; i < 301; i++) cache.set(i, i)
    expect(cache.size).toBe(300)
    expect(cache.has(0)).toBe(false)
    expect(cache.has(300)).toBe(true)
  })
})

describe('clampPreviewLeft', () => {
  it('centres the card on the pointer when there is room', () => {
    // wrapper starts at x=100; pointer at 500 -> card 380..620 -> 280 relative
    expect(clampPreviewLeft(500, 240, 100, 1920)).toBe(280)
  })

  it('keeps the card inside the left window edge', () => {
    expect(clampPreviewLeft(20, 240, 100, 1920)).toBe(8 - 100)
  })

  it('keeps the card inside the right window edge', () => {
    expect(clampPreviewLeft(1915, 240, 100, 1920)).toBe(1920 - 8 - 240 - 100)
  })

  it('pins to the left margin when the window is narrower than the card', () => {
    expect(clampPreviewLeft(100, 240, 0, 200)).toBe(8)
  })
})

describe('previewCardWidth', () => {
  it('scales the card down in narrow windows', () => {
    expect(previewCardWidth(1280)).toBe(240)
    expect(previewCardWidth(500)).toBe(192)
  })
})

describe('secondsAtPointer', () => {
  it('maps the pointer x to a time and clamps outside the bar', () => {
    const rect = { left: 100, width: 200 }
    expect(secondsAtPointer(200, rect, 60)).toBe(30)
    expect(secondsAtPointer(50, rect, 60)).toBe(0)
    expect(secondsAtPointer(400, rect, 60)).toBe(60)
  })

  it('returns null for a zero-width bar or an unknown duration', () => {
    expect(secondsAtPointer(10, { left: 0, width: 0 }, 60)).toBeNull()
    expect(secondsAtPointer(10, { left: 0, width: 100 }, 0)).toBeNull()
    expect(secondsAtPointer(10, { left: 0, width: 100 }, Infinity)).toBeNull()
  })
})
