import { describe, expect, it } from 'vitest'
import { FfmpegUnavailableError, requireFfmpegPath } from './ffmpegBinary'

describe('requireFfmpegPath', () => {
  it('returns an existing binary path', () => {
    expect(requireFfmpegPath('C:\ffmpeg.exe', () => true)).toBe('C:\ffmpeg.exe')
  })
  it('throws when the path is null or the file is missing', () => {
    expect(() => requireFfmpegPath(null, () => true)).toThrow(FfmpegUnavailableError)
    expect(() => requireFfmpegPath('C:\ffmpeg.exe', () => false)).toThrow(FfmpegUnavailableError)
  })
})
