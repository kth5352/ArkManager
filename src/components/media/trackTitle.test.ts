import { describe, expect, it } from 'vitest'
import { displayTitle, shouldAdoptLoadIdentity, shouldHandleEnded } from './trackTitle'

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

describe('shouldAdoptLoadIdentity', () => {
  it('adopts an update for the current track path', () => {
    expect(shouldAdoptLoadIdentity('D:/a.mp3', 'D:/a.mp3')).toBe(true)
  })

  it('ignores an update for another path', () => {
    expect(shouldAdoptLoadIdentity('D:/old.mp3', 'D:/a.mp3')).toBe(false)
  })

  it('ignores an update without a loaded path', () => {
    expect(shouldAdoptLoadIdentity(null, 'D:/a.mp3')).toBe(false)
  })
})

describe('shouldHandleEnded', () => {
  it.each([
    // [ended loadedPath, current track path, handled]
    ['D:/a.mp3', 'D:/a.mp3', true],
    ['D:/a.mp3', 'D:/b.mp3', false],
    ['D:/a.mp3', null, false],
    [null, 'D:/b.mp3', true],
    [null, null, true],
  ] as const)('ended %s while on %s -> %s', (ended, current, handled) => {
    expect(shouldHandleEnded(ended, current)).toBe(handled)
  })
})
