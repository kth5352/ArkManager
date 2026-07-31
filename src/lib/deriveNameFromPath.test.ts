import { describe, it, expect } from 'vitest'
import { deriveNameFromPath } from './deriveNameFromPath'

describe('deriveNameFromPath', () => {
  it('returns the last segment of a Windows path', () => {
    expect(deriveNameFromPath('D:\\Games\\Voice')).toBe('Voice')
  })

  it('returns the last segment of a POSIX-style path', () => {
    expect(deriveNameFromPath('/mnt/games/Voice')).toBe('Voice')
  })

  it('ignores a trailing separator', () => {
    expect(deriveNameFromPath('D:\\Games\\Voice\\')).toBe('Voice')
  })

  it('falls back to the full path when there is no separator', () => {
    expect(deriveNameFromPath('Voice')).toBe('Voice')
  })
})
