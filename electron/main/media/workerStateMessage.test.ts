import { describe, expect, it } from 'vitest'
import { buildStateUpdate, NO_LOAD_IDENTITY } from './workerStateMessage'

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
