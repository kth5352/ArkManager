import { describe, it, expect } from 'vitest'
import { isAudioFile, isMediaFile, isVideoFile } from './isMediaFile'

describe('isVideoFile', () => {
  it.each(['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'm4v'])(
    'recognizes .%s as video',
    (ext) => {
      expect(isVideoFile(`opening.${ext}`)).toBe(true)
    }
  )

  it('is case-insensitive', () => {
    expect(isVideoFile('opening.MP4')).toBe(true)
  })

  it('returns false for an audio file', () => {
    expect(isVideoFile('voice.mp3')).toBe(false)
  })
})

describe('isAudioFile', () => {
  it.each(['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'])('recognizes .%s as audio', (ext) => {
    expect(isAudioFile(`voice.${ext}`)).toBe(true)
  })

  it('returns false for a video file', () => {
    expect(isAudioFile('opening.mp4')).toBe(false)
  })
})

describe('isMediaFile', () => {
  it('returns true for either video or audio', () => {
    expect(isMediaFile('opening.mp4')).toBe(true)
    expect(isMediaFile('voice.mp3')).toBe(true)
  })

  it('returns false for a non-media file', () => {
    expect(isMediaFile('RJ01234567.zip')).toBe(false)
    expect(isMediaFile('readme.txt')).toBe(false)
  })
})
