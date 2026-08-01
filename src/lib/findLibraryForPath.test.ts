import { describe, it, expect } from 'vitest'
import { findLibraryForPath } from './findLibraryForPath'

const libraries = [
  { id: 'a', path: 'D:\\Games' },
  { id: 'b', path: 'E:\\game' },
]

describe('findLibraryForPath', () => {
  it('matches an entry nested under a library', () => {
    expect(findLibraryForPath('D:\\Games\\RJ01234567.zip', libraries)?.id).toBe('a')
  })

  it('matches an entry exactly equal to the library path', () => {
    expect(findLibraryForPath('E:\\game', libraries)?.id).toBe('b')
  })

  it('is case-insensitive', () => {
    expect(findLibraryForPath('d:\\games\\rj01234567.zip', libraries)?.id).toBe('a')
  })

  it('treats backslash and forward slash separators as equivalent', () => {
    expect(findLibraryForPath('D:/Games/RJ01234567.zip', libraries)?.id).toBe('a')
  })

  it('rejects a sibling folder that merely shares a name prefix', () => {
    expect(findLibraryForPath('D:\\Games2\\RJ01234567.zip', libraries)).toBeUndefined()
  })

  it('returns undefined when no library matches', () => {
    expect(findLibraryForPath('F:\\other\\RJ01234567.zip', libraries)).toBeUndefined()
  })

  it('picks the longest matching path when libraries are nested', () => {
    const nested = [
      { id: 'outer', path: 'D:\\Games' },
      { id: 'inner', path: 'D:\\Games\\Sub' },
    ]
    expect(findLibraryForPath('D:\\Games\\Sub\\RJ01234567.zip', nested)?.id).toBe('inner')
  })
})
