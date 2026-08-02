import { describe, it, expect } from 'vitest'
import { extractVersionFromName } from './extractVersion'

describe('extractVersionFromName', () => {
  it('extracts a bare dotted-number version', () => {
    expect(extractVersionFromName('1.2.3')).toBe('1.2.3')
  })

  it('extracts a version embedded in a longer name', () => {
    expect(extractVersionFromName('MyGame_v1.2.3_full')).toBe('1.2.3')
  })

  it('extracts a version from a filename with an extension', () => {
    expect(extractVersionFromName('patch_1.0.5.exe')).toBe('1.0.5')
  })

  it('does not match a two-segment number', () => {
    expect(extractVersionFromName('MyGame_1.2')).toBeNull()
  })

  it('does not match embedded in a longer digit run', () => {
    expect(extractVersionFromName('resolution_1920.1080.999999')).toBeNull()
  })

  it('returns null when there is no version-shaped substring', () => {
    expect(extractVersionFromName('Game.exe')).toBeNull()
  })

  it('returns the first match when multiple are present', () => {
    expect(extractVersionFromName('1.2.3_to_2.0.0_patch')).toBe('1.2.3')
  })
})
