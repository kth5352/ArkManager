import { describe, it, expect } from 'vitest'
import { isArchiveFile } from './isArchiveFile'

describe('isArchiveFile', () => {
  it.each(['zip', '7z', 'rar', 'egg', 'tar', 'gz', 'bz2', 'xz', 'lzh', 'cab', 'iso'])(
    'recognizes .%s as an archive',
    (ext) => {
      expect(isArchiveFile(`RJ01234567.${ext}`)).toBe(true)
    }
  )

  it('is case-insensitive', () => {
    expect(isArchiveFile('RJ01234567.ZIP')).toBe(true)
  })

  it('returns false for a non-archive file', () => {
    expect(isArchiveFile('RJ01234567.exe')).toBe(false)
  })

  it('returns false for a name with no extension', () => {
    expect(isArchiveFile('RJ01234567')).toBe(false)
  })

  it('returns false for a folder-like name (no trailing extension)', () => {
    expect(isArchiveFile('MyGame')).toBe(false)
  })
})
