import { describe, expect, it } from 'vitest'
import {
  buildEndedMessage,
  buildStateUpdate,
  NO_LOAD_IDENTITY,
  readMediaTitle,
} from './workerStateMessage'

describe('buildStateUpdate', () => {
  it('stamps the given load identity on the message', () => {
    const msg = buildStateUpdate(
      { loadGeneration: 7, loadedPath: 'D:/a.mp3' },
      { isPlaying: true, currentTime: 1, duration: 2, error: null, mediaTitle: 'T' }
    )
    expect(msg).toEqual({
      type: 'state-update',
      isPlaying: true,
      currentTime: 1,
      duration: 2,
      error: null,
      mediaTitle: 'T',
      loadGeneration: 7,
      loadedPath: 'D:/a.mp3',
    })
  })

  it('has a non-adoptable identity before any load', () => {
    const msg = buildStateUpdate(NO_LOAD_IDENTITY, {
      isPlaying: false,
      currentTime: 0,
      duration: null,
      error: 'x',
      mediaTitle: null,
    })
    expect(msg.loadedPath).toBeNull()
    expect(msg.loadGeneration).toBe(0)
  })
})

describe('buildEndedMessage', () => {
  it('carries the load identity of the track that ended', () => {
    expect(buildEndedMessage({ loadGeneration: 3, loadedPath: 'D:/a.mp3' })).toEqual({
      type: 'ended',
      loadGeneration: 3,
      loadedPath: 'D:/a.mp3',
    })
  })
})

describe('readMediaTitle', () => {
  it('returns the title from an addon that exports getMediaTitle', () => {
    expect(readMediaTitle({ getMediaTitle: () => 'Song' })).toBe('Song')
    expect(readMediaTitle({ getMediaTitle: () => null })).toBeNull()
  })

  it('returns null instead of throwing for an old addon without getMediaTitle', () => {
    expect(readMediaTitle({})).toBeNull()
  })
})
