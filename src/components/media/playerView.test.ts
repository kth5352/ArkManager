import { describe, expect, it } from 'vitest'
import {
  LYRICS_HIDDEN_BOTTOM_PX,
  deriveHoldReasons,
  isKeyboardFocus,
  lyricsBottomPx,
  progressFraction,
} from './playerView'

const IDLE = {
  pointerOverControls: false,
  dragging: false,
  isPlaying: true,
  sidebarOpen: false,
  popoverOpen: false,
  focusInControls: false,
}

describe('deriveHoldReasons', () => {
  it('holds nothing while playing with no interaction', () => {
    expect(deriveHoldReasons(IDLE)).toEqual({
      pointerOverControls: false,
      dragging: false,
      paused: false,
      sidebarOpen: false,
      popoverOpen: false,
      focusInControls: false,
    })
  })

  it('maps "not playing" to the paused hold', () => {
    expect(deriveHoldReasons({ ...IDLE, isPlaying: false }).paused).toBe(true)
  })

  it.each([
    'pointerOverControls',
    'dragging',
    'sidebarOpen',
    'popoverOpen',
    'focusInControls',
  ] as const)('passes %s through', (key) => {
    expect(deriveHoldReasons({ ...IDLE, [key]: true })[key]).toBe(true)
  })
})

describe('lyricsBottomPx', () => {
  it('sits right above the bottom band while it is shown', () => {
    expect(lyricsBottomPx(true, 96)).toBe(96)
  })

  it('drops to 24px from the bottom while the bands are hidden', () => {
    expect(LYRICS_HIDDEN_BOTTOM_PX).toBe(24)
    expect(lyricsBottomPx(false, 96)).toBe(24)
  })

  it('never goes below the hidden offset (band not measured yet)', () => {
    expect(lyricsBottomPx(true, 0)).toBe(24)
  })
})

describe('progressFraction', () => {
  it('is the played share of the duration', () => {
    expect(progressFraction(30, 120)).toBe(0.25)
  })

  it('is 0 for an unknown or zero duration', () => {
    expect(progressFraction(30, 0)).toBe(0)
    expect(progressFraction(30, Infinity)).toBe(0)
    expect(progressFraction(30, Number.NaN)).toBe(0)
  })

  it('clamps to [0, 1]', () => {
    expect(progressFraction(-5, 100)).toBe(0)
    expect(progressFraction(150, 100)).toBe(1)
  })
})

describe('isKeyboardFocus', () => {
  it('uses :focus-visible when the engine supports it', () => {
    expect(isKeyboardFocus({ matches: (s: string) => s === ':focus-visible' })).toBe(true)
    expect(isKeyboardFocus({ matches: () => false })).toBe(false)
  })

  it('treats focus as keyboard focus when :focus-visible is unsupported', () => {
    expect(
      isKeyboardFocus({
        matches: () => {
          throw new SyntaxError('unsupported selector')
        },
      })
    ).toBe(true)
  })

  it('is false without an element', () => {
    expect(isKeyboardFocus(null)).toBe(false)
  })
})
