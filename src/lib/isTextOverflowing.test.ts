import { describe, expect, it } from 'vitest'
import { isTextOverflowing } from './isTextOverflowing'

// Vitest's environment for this project is 'node' (no document/jsdom - see
// vitest.config.ts), and isTextOverflowing only ever reads scrollWidth/
// clientWidth off its argument, so a plain object satisfies the function
// without needing a real DOM element or a jsdom dependency.
function makeElement(scrollWidth: number, clientWidth: number): HTMLElement {
  return { scrollWidth, clientWidth } as HTMLElement
}

describe('isTextOverflowing', () => {
  it('returns true when scrollWidth exceeds clientWidth', () => {
    expect(isTextOverflowing(makeElement(200, 100))).toBe(true)
  })

  it('returns false when content fits exactly', () => {
    expect(isTextOverflowing(makeElement(100, 100))).toBe(false)
  })

  it('returns false when content is narrower than the container', () => {
    expect(isTextOverflowing(makeElement(80, 100))).toBe(false)
  })
})
