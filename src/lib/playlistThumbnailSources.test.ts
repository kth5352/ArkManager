import { describe, expect, it } from 'vitest'
import { computePlaylistThumbnailSource } from './playlistThumbnailSources'

describe('computePlaylistThumbnailSource', () => {
  it('returns the cover URL when hasCoverImage is true, ignoring track paths', () => {
    expect(computePlaylistThumbnailSource(true, 'pl-1', ['C:/a.mp3'])).toEqual({
      kind: 'cover',
      url: 'mediathumb://playlist-cover/pl-1',
    })
  })

  it('builds a 4-tile grid from the first 4 tracks when no cover is set', () => {
    const result = computePlaylistThumbnailSource(false, 'pl-1', [
      'C:/a.mp3',
      'C:/b.mp3',
      'C:/c.mp3',
      'C:/d.mp3',
      'C:/e.mp3',
    ])
    expect(result).toEqual({
      kind: 'grid',
      tileUrls: [
        'mediathumb://thumbnail/C%3A%2Fa.mp3',
        'mediathumb://thumbnail/C%3A%2Fb.mp3',
        'mediathumb://thumbnail/C%3A%2Fc.mp3',
        'mediathumb://thumbnail/C%3A%2Fd.mp3',
      ],
    })
  })

  it('pads remaining tiles with null when fewer than 4 tracks exist', () => {
    const result = computePlaylistThumbnailSource(false, 'pl-1', ['C:/a.mp3'])
    expect(result).toEqual({
      kind: 'grid',
      tileUrls: ['mediathumb://thumbnail/C%3A%2Fa.mp3', null, null, null],
    })
  })

  it('returns all-null tiles for an empty playlist', () => {
    expect(computePlaylistThumbnailSource(false, 'pl-1', [])).toEqual({
      kind: 'grid',
      tileUrls: [null, null, null, null],
    })
  })

  it('omits the ?v= query string when coverVersion is left at its default 0 (I1 regression: no query param means no behavior change)', () => {
    expect(computePlaylistThumbnailSource(true, 'pl-1', [])).toEqual({
      kind: 'cover',
      url: 'mediathumb://playlist-cover/pl-1',
    })
  })

  it('appends a cache-busting ?v= query string once coverVersion is bumped past 0 (I1 regression)', () => {
    expect(computePlaylistThumbnailSource(true, 'pl-1', [], 3)).toEqual({
      kind: 'cover',
      url: 'mediathumb://playlist-cover/pl-1?v=3',
    })
  })
})
