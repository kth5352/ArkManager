import { describe, it, expect } from 'vitest'
import {
  clampMediaSidebarWidth,
  MEDIA_SIDEBAR_WIDTH_DEFAULT,
  MEDIA_SIDEBAR_WIDTH_MAX,
  MEDIA_SIDEBAR_WIDTH_MIN,
} from './clampMediaSidebarWidth'

describe('clampMediaSidebarWidth', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampMediaSidebarWidth(300)).toBe(300)
  })

  it('clamps to the minimum when below it', () => {
    expect(clampMediaSidebarWidth(50)).toBe(MEDIA_SIDEBAR_WIDTH_MIN)
  })

  it('clamps to the maximum when above it', () => {
    expect(clampMediaSidebarWidth(900)).toBe(MEDIA_SIDEBAR_WIDTH_MAX)
  })

  it('falls back to the default for NaN', () => {
    expect(clampMediaSidebarWidth(Number.NaN)).toBe(MEDIA_SIDEBAR_WIDTH_DEFAULT)
  })
})
