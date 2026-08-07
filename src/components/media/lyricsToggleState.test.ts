import { describe, expect, it } from 'vitest'
import { isLyricsEnabledForTrack, toggleLyricsDisabledForTrack } from './lyricsToggleState'

describe('lyricsToggleState', () => {
  it('enables lyrics by default when the current track has lyrics', () => {
    expect(isLyricsEnabledForTrack('D:\\Media\\song.mp3', true, new Set())).toBe(true)
  })

  it('keeps lyrics off for a track the user disabled', () => {
    expect(isLyricsEnabledForTrack('D:\\Media\\song.mp3', true, new Set(['D:\\Media\\song.mp3']))).toBe(
      false
    )
  })

  it('toggles the current track disabled set', () => {
    const path = 'D:\\Media\\song.mp3'

    expect([...toggleLyricsDisabledForTrack(path, new Set())]).toEqual([path])
    expect([...toggleLyricsDisabledForTrack(path, new Set([path]))]).toEqual([])
  })
})
