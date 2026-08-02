import { describe, it, expect } from 'vitest'
import { compareVersions } from './compareVersions'

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('returns 1 when a is greater', () => {
    expect(compareVersions('1.3.0', '1.2.9')).toBe(1)
  })

  it('returns -1 when a is less', () => {
    expect(compareVersions('1.2.0', '1.3.0')).toBe(-1)
  })

  it('treats missing trailing segments as 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.0.1', '1.2')).toBe(1)
  })

  it('compares multi-digit segments numerically, not lexically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
  })

  it('returns null when a has a non-numeric segment', () => {
    expect(compareVersions('베타', '1.0.0')).toBeNull()
  })

  it('returns null when b has a non-numeric segment', () => {
    expect(compareVersions('1.0.0', 'v1.0.0')).toBeNull()
  })
})
