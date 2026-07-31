import { describe, it, expect } from 'vitest'
import {
  clampSidebarWidth,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
} from './clampSidebarWidth'

describe('clampSidebarWidth', () => {
  it('returns the value unchanged when within bounds', () => {
    expect(clampSidebarWidth(400)).toBe(400)
  })

  it('clamps to the minimum when below it', () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_WIDTH_MIN)
  })

  it('clamps to the maximum when above it', () => {
    expect(clampSidebarWidth(900)).toBe(SIDEBAR_WIDTH_MAX)
  })

  it('falls back to the default for NaN', () => {
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH_DEFAULT)
  })
})
