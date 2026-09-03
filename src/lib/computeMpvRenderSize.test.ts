import { describe, expect, it } from 'vitest'
import { computeMpvRenderSize } from './computeMpvRenderSize'

describe('computeMpvRenderSize', () => {
  it('scales by devicePixelRatio and rounds', () => {
    expect(computeMpvRenderSize(640, 360, 1)).toEqual({ width: 640, height: 360 })
    expect(computeMpvRenderSize(640, 360, 1.5)).toEqual({ width: 960, height: 540 })
    expect(computeMpvRenderSize(100.4, 50.6, 1)).toEqual({ width: 100, height: 51 })
  })

  it('clamps degenerate sizes to a minimum of 2x2', () => {
    expect(computeMpvRenderSize(0, 0, 1)).toEqual({ width: 2, height: 2 })
    expect(computeMpvRenderSize(1, 1, 1)).toEqual({ width: 2, height: 2 })
  })
})
