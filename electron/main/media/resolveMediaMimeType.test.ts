import { describe, it, expect } from 'vitest'
import { resolveMediaMimeType } from './resolveMediaMimeType'

describe('resolveMediaMimeType', () => {
  it('resolves a known video extension', () => {
    expect(resolveMediaMimeType('C:\\games\\clip.mp4')).toBe('video/mp4')
  })

  it('resolves a known audio extension', () => {
    expect(resolveMediaMimeType('C:\\games\\song.mp3')).toBe('audio/mpeg')
  })

  it('is case-insensitive', () => {
    expect(resolveMediaMimeType('C:\\games\\clip.MP4')).toBe('video/mp4')
  })

  it('falls back to a generic type for an unrecognized extension', () => {
    expect(resolveMediaMimeType('C:\\games\\readme.txt')).toBe('application/octet-stream')
  })
})
