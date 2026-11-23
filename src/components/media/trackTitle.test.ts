import { describe, expect, it } from 'vitest'
import { displayTitle } from './trackTitle'

describe('displayTitle', () => {
  it('uses the media title tag when present and different from the file name', () => {
    expect(displayTitle('Real Title', 'track01.mp3')).toBe('Real Title')
  })

  it('falls back to the file name without extension when the title equals the file name', () => {
    expect(displayTitle('track01.mp3', 'track01.mp3')).toBe('track01')
  })

  it('falls back when the title is null or empty', () => {
    expect(displayTitle(null, 'track01.mp3')).toBe('track01')
    expect(displayTitle('', 'track01.mp3')).toBe('track01')
  })

  it('only strips the last extension of a multi-dot file name', () => {
    expect(displayTitle(null, 'vol.1.final.mix.flac')).toBe('vol.1.final.mix')
  })

  it('keeps a file name without extension unchanged', () => {
    expect(displayTitle(null, 'README')).toBe('README')
  })

  it('compares case-sensitively', () => {
    expect(displayTitle('TRACK01.MP3', 'track01.mp3')).toBe('TRACK01.MP3')
  })
})
