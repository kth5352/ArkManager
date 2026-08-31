import { describe, expect, it } from 'vitest'
import {
  getPlaylistDetailWidthMode,
  PLAYLIST_DETAIL_NARROW_BREAKPOINT,
} from './playlistDetailWidthMode'

describe('getPlaylistDetailWidthMode', () => {
  it('returns wide well above the breakpoint', () => {
    expect(getPlaylistDetailWidthMode(800)).toBe('wide')
  })

  it('returns narrow well below the breakpoint', () => {
    expect(getPlaylistDetailWidthMode(300)).toBe('narrow')
  })

  it('returns wide exactly at the breakpoint', () => {
    expect(getPlaylistDetailWidthMode(PLAYLIST_DETAIL_NARROW_BREAKPOINT)).toBe('wide')
  })

  it('returns narrow one pixel below the breakpoint', () => {
    expect(getPlaylistDetailWidthMode(PLAYLIST_DETAIL_NARROW_BREAKPOINT - 1)).toBe('narrow')
  })
})
