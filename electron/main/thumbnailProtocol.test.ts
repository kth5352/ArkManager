import { describe, expect, it } from 'vitest'
import { isPathWithinAnyLibrary } from './thumbnailProtocol'

describe('isPathWithinAnyLibrary', () => {
  it('accepts a path nested under a registered library', () => {
    expect(isPathWithinAnyLibrary('D:\\Games\\RJ01234567', ['D:\\Games'])).toBe(true)
  })

  it('accepts a path exactly equal to a registered library', () => {
    expect(isPathWithinAnyLibrary('D:\\Games', ['D:\\Games'])).toBe(true)
  })

  it('rejects a path outside every registered library', () => {
    expect(isPathWithinAnyLibrary('C:\\Users\\victim\\Documents', ['D:\\Games'])).toBe(false)
  })

  it('rejects a sibling folder that merely shares a name prefix', () => {
    expect(isPathWithinAnyLibrary('D:\\Games2\\RJ01234567', ['D:\\Games'])).toBe(false)
  })

  it('is case-insensitive, matching normalizeLibraryPath', () => {
    expect(isPathWithinAnyLibrary('d:\\games\\RJ01234567', ['D:\\Games'])).toBe(true)
  })

  it('treats backslash and forward slash separators as equivalent', () => {
    expect(isPathWithinAnyLibrary('D:/Games/RJ01234567', ['D:\\Games'])).toBe(true)
  })

  it('rejects when no libraries are registered', () => {
    expect(isPathWithinAnyLibrary('D:\\Games\\RJ01234567', [])).toBe(false)
  })
})
