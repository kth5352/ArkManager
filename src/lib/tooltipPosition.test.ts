import { expect, it } from 'vitest'
import { placeTooltip } from './tooltipPosition'

it('keeps a bottom-right tooltip inside the viewport', () => {
  expect(
    placeTooltip(
      { left: 290, right: 318, top: 170, bottom: 198 },
      { width: 120, height: 30 },
      { width: 320, height: 200 }
    )
  ).toEqual({ left: 192, top: 134 })
})

it('clamps the top edge when neither side fits', () => {
  expect(
    placeTooltip(
      { left: 0, right: 12, top: 0, bottom: 10 },
      { width: 90, height: 80 },
      { width: 120, height: 90 }
    )
  ).toEqual({ left: 8, top: 8 })
})

it('flips above the trigger when there is not enough room below but there is above', () => {
  expect(
    placeTooltip(
      { left: 50, right: 150, top: 370, bottom: 390 },
      { width: 100, height: 30 },
      { width: 400, height: 400 }
    )
  ).toEqual({ left: 50, top: 334 })
})

it('clamps the left edge to the margin instead of going negative for a trigger flush against the left edge', () => {
  expect(
    placeTooltip(
      { left: -4, right: 20, top: 50, bottom: 70 },
      { width: 100, height: 30 },
      { width: 400, height: 400 }
    )
  ).toEqual({ left: 8, top: 76 })
})
