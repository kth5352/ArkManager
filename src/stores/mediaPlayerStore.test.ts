import { describe, it, expect, beforeEach } from 'vitest'
import { useMediaPlayerStore } from './mediaPlayerStore'

describe('useMediaPlayerStore reorderPlaylist', () => {
  beforeEach(() => {
    useMediaPlayerStore.setState({
      playlist: [
        { path: 'C:/a.mp3', name: 'a' },
        { path: 'C:/b.mp3', name: 'b' },
        { path: 'C:/c.mp3', name: 'c' },
      ],
      currentIndex: 0,
    })
  })

  it('moves a track from one index to another', () => {
    useMediaPlayerStore.getState().reorderPlaylist(2, 0)
    expect(useMediaPlayerStore.getState().playlist.map((t) => t.name)).toEqual(['c', 'a', 'b'])
  })

  it('keeps currentIndex pointing at the same track after a reorder', () => {
    // currentIndex starts at 0 (track "a") - moving "c" (index 2) to the
    // front shifts "a" from index 0 to index 1, so currentIndex must follow.
    useMediaPlayerStore.getState().reorderPlaylist(2, 0)
    const state = useMediaPlayerStore.getState()
    expect(state.playlist[state.currentIndex!].name).toBe('a')
  })
})
