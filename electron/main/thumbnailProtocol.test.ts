import { describe, expect, it } from 'vitest'
import { isPathExactlyTrusted, isPathWithinAnyLibrary } from './thumbnailProtocol'

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

  it('rejects a path that escapes the library root via .. segments', () => {
    expect(
      isPathWithinAnyLibrary('D:\\Games\\LibraryA\\..\\..\\Windows\\system.ini', [
        'D:\\Games\\LibraryA',
      ])
    ).toBe(false)
  })

  it('accepts a path containing .. segments that still resolves inside the library', () => {
    expect(
      isPathWithinAnyLibrary('D:\\Games\\LibraryA\\..\\LibraryA\\RJ01234567', [
        'D:\\Games\\LibraryA',
      ])
    ).toBe(true)
  })
})

describe('isPathExactlyTrusted', () => {
  it('accepts a path that exactly matches a trusted path', () => {
    expect(isPathExactlyTrusted('D:\\Music\\track.mp3', ['D:\\Music\\track.mp3'])).toBe(true)
  })

  it('is case-insensitive and separator-agnostic, matching normalizeLibraryPath', () => {
    expect(isPathExactlyTrusted('d:/music/track.mp3', ['D:\\Music\\track.mp3'])).toBe(true)
  })

  it('rejects a path that is not in the trusted list', () => {
    expect(isPathExactlyTrusted('D:\\Music\\other.mp3', ['D:\\Music\\track.mp3'])).toBe(false)
  })

  it('rejects a path nested inside a trusted path (exact match only, not prefix)', () => {
    expect(isPathExactlyTrusted('D:\\Music\\Folder\\track.mp3', ['D:\\Music\\Folder'])).toBe(false)
  })

  it('returns false for an empty trusted-paths list', () => {
    expect(isPathExactlyTrusted('D:\\Music\\track.mp3', [])).toBe(false)
  })
})
