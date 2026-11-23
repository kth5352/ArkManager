import { describe, expect, it } from 'vitest'
import { buildMediaCoverUrl, buildMediaThumbnailUrl } from './mediaThumbnailProtocolService'

describe('mediaThumbnailProtocolService', () => {
  it('buildMediaThumbnailUrl is unchanged without a version', () => {
    expect(buildMediaThumbnailUrl('D://a b/#1.mp3')).toBe(
      `mediathumb://thumbnail/${encodeURIComponent('D://a b/#1.mp3')}`
    )
  })

  it('buildMediaThumbnailUrl appends an encoded version when given', () => {
    expect(buildMediaThumbnailUrl('D:/a.mp3', '3-2')).toBe(
      `mediathumb://thumbnail/${encodeURIComponent('D:/a.mp3')}?v=3-2`
    )
  })

  it('buildMediaCoverUrl appends encoded version', () => {
    expect(buildMediaCoverUrl('D:/a.mp3', '3-2 x')).toBe(
      `mediathumb://cover/${encodeURIComponent('D:/a.mp3')}?v=${encodeURIComponent('3-2 x')}`
    )
  })
})
